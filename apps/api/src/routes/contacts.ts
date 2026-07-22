import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { randomUUID } from 'node:crypto'
import { eq, and, or, asc, desc, ilike, sql, inArray } from 'drizzle-orm'
import { db } from '../db'
import { contacts, tags, contactTags, customFieldDefinitions, contactActivities } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'
import type { ContactStatus } from '@colonia-crm/shared'
import { validateCustomFieldsPatch } from '../contacts/custom-fields-validation'
import { logActivity, logActivities } from '../contacts/activity-log'
import { matchStatus, dedupeImportRows, type ImportRowInput } from '../contacts/csv-import'

const CONTACT_STATUSES: ContactStatus[] = ['lead', 'prospect', 'client', 'inactive']
const MAX_BULK_IDS = 500
const MAX_IMPORT_ROWS = 500

type ContactBody = Partial<{
  name: string
  email: string
  phone: string
  companyName: string
  status: ContactStatus
  notes: string
  customFields: Record<string, unknown>
}>

async function getContactFieldDefinitions() {
  return db.query.customFieldDefinitions.findMany({
    where: eq(customFieldDefinitions.entityType, 'contact'),
  })
}

const contactsRoutes = new Hono<{ Variables: HonoVariables }>()

contactsRoutes.use('*', authMiddleware)

contactsRoutes.get('/', async (c) => {
  const search   = c.req.query('search')?.trim()
  const status   = c.req.query('status')
  const tagId    = c.req.query('tagId')
  const sort     = c.req.query('sort') ?? 'createdAt_desc'
  const page     = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 50))

  const conditions = []

  if (search) {
    const term = `%${search}%`
    conditions.push(
      or(
        ilike(contacts.name, term),
        ilike(contacts.email, term),
        ilike(contacts.companyName, term),
      )!,
    )
  }

  if (status && CONTACT_STATUSES.includes(status as ContactStatus)) {
    conditions.push(eq(contacts.status, status as ContactStatus))
  }

  if (tagId) {
    const matches = await db.query.contactTags.findMany({
      where: eq(contactTags.tagId, tagId),
    })
    conditions.push(inArray(contacts.id, matches.map((m) => m.contactId)))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [sortColumn, sortDir] = sort.split('_')
  const orderColumn = sortColumn === 'name' ? contacts.name : contacts.createdAt
  const orderBy     = sortDir === 'asc' ? asc(orderColumn) : desc(orderColumn)

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(where)
  const count = countRows[0]?.count ?? 0

  const rows = await db.query.contacts.findMany({
    where,
    orderBy,
    limit:  pageSize,
    offset: (page - 1) * pageSize,
  })

  const contactIds = rows.map((r) => r.id)
  const tagRows = contactIds.length > 0
    ? await db
        .select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : []

  const tagsByContact = new Map<string, { id: string; name: string; color: string | null }[]>()
  for (const row of tagRows) {
    const list = tagsByContact.get(row.contactId) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    tagsByContact.set(row.contactId, list)
  }

  const items = rows.map((r) => ({ ...r, tags: tagsByContact.get(r.id) ?? [] }))

  return c.json({ status: 'ok', items, total: count, page, pageSize })
})

// Rutas literales /bulk deben registrarse antes de /:id para que el router
// no confunda "bulk" con un id de contacto.
contactsRoutes.patch('/bulk', async (c) => {
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => null) as {
    ids?: string[]
    status?: ContactStatus
    addTagId?: string
  } | null

  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids)] : []
  if (ids.length === 0) {
    throw new HTTPException(400, { message: 'Seleccioná al menos un contacto' })
  }
  if (ids.length > MAX_BULK_IDS) {
    throw new HTTPException(400, { message: `No se pueden editar más de ${MAX_BULK_IDS} contactos a la vez` })
  }

  const status   = body?.status && CONTACT_STATUSES.includes(body.status) ? body.status : undefined
  const addTagId = body?.addTagId
  if (!status && !addTagId) {
    throw new HTTPException(400, { message: 'Especificá un estado o una etiqueta a aplicar' })
  }

  const existingContacts = await db.query.contacts.findMany({
    where: inArray(contacts.id, ids),
  })
  if (existingContacts.length === 0) {
    throw new HTTPException(404, { message: 'Ningún contacto válido encontrado' })
  }
  const validIds = existingContacts.map((row) => row.id)

  if (status) {
    await db.update(contacts).set({ status, updatedAt: new Date() })
      .where(inArray(contacts.id, validIds))

    await logActivities(
      existingContacts
        .filter((row) => row.status !== status)
        .map((row) => ({
          contactId: row.id, userId,
          type: 'status_change' as const,
          metadata: { from: row.status, to: status },
        })),
    )
  }

  if (addTagId) {
    const tag = await db.query.tags.findFirst({
      where: eq(tags.id, addTagId),
    })
    if (!tag) {
      throw new HTTPException(404, { message: 'Etiqueta no encontrada' })
    }

    await db.insert(contactTags)
      .values(validIds.map((id) => ({ contactId: id, tagId: addTagId })))
      .onConflictDoNothing()

    await logActivities(
      validIds.map((id) => ({
        contactId: id, userId,
        type: 'updated' as const,
        content: `Etiqueta agregada: ${tag.name}`,
      })),
    )
  }

  return c.json({ status: 'ok', updated: validIds.length })
})

contactsRoutes.delete('/bulk', async (c) => {
  const body = await c.req.json().catch(() => null) as { ids?: string[] } | null
  const ids  = Array.isArray(body?.ids) ? [...new Set(body.ids)] : []

  if (ids.length === 0) {
    throw new HTTPException(400, { message: 'Seleccioná al menos un contacto' })
  }
  if (ids.length > MAX_BULK_IDS) {
    throw new HTTPException(400, { message: `No se pueden eliminar más de ${MAX_BULK_IDS} contactos a la vez` })
  }

  const existingContacts = await db.query.contacts.findMany({
    where: inArray(contacts.id, ids),
  })
  if (existingContacts.length === 0) {
    throw new HTTPException(404, { message: 'Ningún contacto válido encontrado' })
  }
  const validIds = existingContacts.map((row) => row.id)

  await db.delete(contacts).where(inArray(contacts.id, validIds))

  return c.json({ status: 'ok', deleted: validIds.length })
})

contactsRoutes.post('/import', async (c) => {
  const userId = c.get('userId')

  const body     = await c.req.json().catch(() => null) as { rows?: ImportRowInput[] } | null
  const rawRows  = Array.isArray(body?.rows) ? body.rows : []

  if (rawRows.length === 0) {
    throw new HTTPException(400, { message: 'El archivo no tiene filas para importar' })
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new HTTPException(400, { message: `No se pueden importar más de ${MAX_IMPORT_ROWS} filas a la vez` })
  }

  const { rows: dedupedRows, skipped: dedupeSkipped } = dedupeImportRows(rawRows)
  const skipped: { row: number; error: string }[] = [...dedupeSkipped]

  const definitions = await getContactFieldDefinitions()

  // Una sola query trae los posibles matches de email para todas las filas.
  const emails = [...new Set(
    dedupedRows.map((r) => r.email?.trim().toLowerCase()).filter((e): e is string => !!e),
  )]
  const existingByEmail = new Map<string, (typeof contacts.$inferSelect)[]>()
  if (emails.length > 0) {
    const matches = await db.select().from(contacts)
      .where(inArray(sql`lower(${contacts.email})`, emails))
    for (const row of matches) {
      const key  = row.email!.trim().toLowerCase()
      const list = existingByEmail.get(key) ?? []
      list.push(row)
      existingByEmail.set(key, list)
    }
  }

  // Mapa de tags por nombre (minúsculas), creando los que falten en un solo insert.
  const allTags   = await db.query.tags.findMany()
  const tagByName = new Map(allTags.map((t) => [t.name.toLowerCase(), t]))

  const requestedTagNames = new Set<string>()
  for (const row of dedupedRows) {
    for (const name of row.tagNames ?? []) {
      const trimmed = name.trim()
      if (trimmed) requestedTagNames.add(trimmed)
    }
  }
  const missingTagNames = [...requestedTagNames].filter((name) => !tagByName.has(name.toLowerCase()))
  if (missingTagNames.length > 0) {
    await db.insert(tags).values(missingTagNames.map((name) => ({ name }))).onConflictDoNothing()
    const refreshed = await db.query.tags.findMany()
    tagByName.clear()
    for (const t of refreshed) tagByName.set(t.name.toLowerCase(), t)
  }

  type ToInsertRow = { row: number; id: string; values: typeof contacts.$inferInsert; tagIds: string[] }
  type ToUpdateRow = { row: number; id: string; values: Record<string, unknown>; tagIds: string[] }

  const toInsert: ToInsertRow[] = []
  const toUpdate: ToUpdateRow[] = []

  for (const row of dedupedRows) {
    const name = row.name?.trim()
    if (!name) {
      skipped.push({ row: row.row, error: 'Falta el nombre' })
      continue
    }

    const customFieldsResult = validateCustomFieldsPatch(definitions, row.customFields ?? {})
    if (!customFieldsResult.valid) {
      skipped.push({ row: row.row, error: customFieldsResult.error })
      continue
    }

    const status = matchStatus(row.status)
    const tagIds = (row.tagNames ?? [])
      .map((n) => tagByName.get(n.trim().toLowerCase())?.id)
      .filter((id): id is string => !!id)

    const email   = row.email?.trim().toLowerCase()
    const matches = email ? existingByEmail.get(email) : undefined

    if (matches && matches.length > 1) {
      skipped.push({ row: row.row, error: 'email ambiguo: coincide con más de un contacto existente' })
      continue
    }

    if (matches && matches.length === 1) {
      const existing = matches[0]
      if (!existing) continue
      toUpdate.push({
        row: row.row,
        id:  existing.id,
        values: {
          name,
          email:        row.email!.trim(),
          phone:        row.phone?.trim() || existing.phone,
          companyName:  row.companyName?.trim() || existing.companyName,
          ...(status ? { status } : {}),
          customFields: { ...existing.customFields, ...customFieldsResult.values },
          updatedAt:    new Date(),
        },
        tagIds,
      })
    } else {
      const id = randomUUID()
      toInsert.push({
        row: row.row,
        id,
        values: {
          id,
          name,
          email:        row.email?.trim() || null,
          phone:        row.phone?.trim() || null,
          companyName:  row.companyName?.trim() || null,
          status:       status ?? 'lead',
          customFields: customFieldsResult.values,
        },
        tagIds,
      })
    }
  }

  if (toInsert.length > 0) {
    await db.insert(contacts).values(toInsert.map((r) => r.values))
  }

  // Los updates se procesan en chunks secuenciales con Promise.allSettled — un fallo
  // individual no aborta el resto ni obliga a reportar todo el import como un error.
  const CHUNK_SIZE = 25
  const successfulUpdateIds = new Set<string>()
  for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
    const chunk = toUpdate.slice(i, i + CHUNK_SIZE)
    const results = await Promise.allSettled(
      chunk.map((r) => db.update(contacts).set(r.values)
        .where(eq(contacts.id, r.id))),
    )
    results.forEach((result, idx) => {
      const r = chunk[idx]
      if (!r) return
      if (result.status === 'fulfilled') {
        successfulUpdateIds.add(r.id)
      } else {
        skipped.push({ row: r.row, error: 'No se pudo actualizar el contacto' })
      }
    })
  }

  // Asignación de tags — agrega, no reemplaza los que el contacto ya tenía.
  const tagAssignments: { contactId: string; tagId: string }[] = []
  for (const r of toInsert) {
    for (const tagId of r.tagIds) tagAssignments.push({ contactId: r.id, tagId })
  }
  for (const r of toUpdate) {
    if (successfulUpdateIds.has(r.id)) {
      for (const tagId of r.tagIds) tagAssignments.push({ contactId: r.id, tagId })
    }
  }
  if (tagAssignments.length > 0) {
    await db.insert(contactTags).values(tagAssignments).onConflictDoNothing()
  }

  await logActivities([
    ...toInsert.map((r) => ({
      contactId: r.id, userId, type: 'created' as const,
    })),
    ...toUpdate
      .filter((r) => successfulUpdateIds.has(r.id))
      .map((r) => ({
        contactId: r.id, userId, type: 'updated' as const,
        content: 'Actualizado por importación CSV',
      })),
  ])

  return c.json({
    status:  'ok',
    created: toInsert.length,
    updated: successfulUpdateIds.size,
    skipped,
  }, 201)
})

contactsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  return c.json({ status: 'ok', item: contact })
})

contactsRoutes.get('/:id/tags', async (c) => {
  const id = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, id))

  return c.json({ status: 'ok', items: rows })
})

contactsRoutes.put('/:id/tags', async (c) => {
  const id = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const body   = await c.req.json().catch(() => null) as { tagIds?: string[] } | null
  const tagIds = Array.isArray(body?.tagIds) ? [...new Set(body.tagIds)] : []

  if (tagIds.length > 0) {
    const validTags = await db.query.tags.findMany({
      where: inArray(tags.id, tagIds),
    })
    if (validTags.length !== tagIds.length) {
      throw new HTTPException(400, { message: 'Una o más etiquetas no son válidas' })
    }
  }

  await db.delete(contactTags).where(eq(contactTags.contactId, id))

  if (tagIds.length > 0) {
    await db.insert(contactTags).values(tagIds.map((tagId) => ({ contactId: id, tagId })))
  }

  return c.json({ status: 'ok' })
})

contactsRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => null) as ContactBody | null

  const name = body?.name?.trim()
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre es requerido' })
  }

  const status = body?.status && CONTACT_STATUSES.includes(body.status) ? body.status : 'lead'

  let customFields: Record<string, string | number | boolean | null> = {}
  if (body?.customFields) {
    const definitions = await getContactFieldDefinitions()
    const result = validateCustomFieldsPatch(definitions, body.customFields)
    if (!result.valid) {
      throw new HTTPException(400, { message: result.error })
    }
    customFields = result.values
  }

  const [contact] = await db.insert(contacts).values({
    name,
    email:       body?.email?.trim() || null,
    phone:       body?.phone?.trim() || null,
    companyName: body?.companyName?.trim() || null,
    status,
    notes:       body?.notes?.trim() || null,
    customFields,
  }).returning()

  if (!contact) {
    throw new HTTPException(500, { message: 'No se pudo crear el contacto' })
  }

  await logActivity({ contactId: contact.id, userId, type: 'created' })

  return c.json({ status: 'ok', item: contact }, 201)
})

contactsRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id     = c.req.param('id')

  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const body = await c.req.json().catch(() => null) as ContactBody | null

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.name !== undefined)        patch.name        = body.name.trim()
  if (body?.email !== undefined)       patch.email       = body.email.trim() || null
  if (body?.phone !== undefined)       patch.phone       = body.phone.trim() || null
  if (body?.companyName !== undefined) patch.companyName = body.companyName.trim() || null
  if (body?.notes !== undefined)       patch.notes       = body.notes.trim() || null
  if (body?.status !== undefined && CONTACT_STATUSES.includes(body.status)) {
    patch.status = body.status
  }

  if (body?.customFields !== undefined) {
    const definitions = await getContactFieldDefinitions()
    const result = validateCustomFieldsPatch(definitions, body.customFields)
    if (!result.valid) {
      throw new HTTPException(400, { message: result.error })
    }
    // Merge, no reemplazo — un PATCH parcial no debe borrar los demás
    // custom fields que ya tenía el contacto.
    patch.customFields = { ...existing.customFields, ...result.values }
  }

  const [updated] = await db.update(contacts).set(patch).where(eq(contacts.id, id)).returning()

  if (patch.status !== undefined && patch.status !== existing.status) {
    await logActivity({
      contactId: id, userId,
      type: 'status_change',
      metadata: { from: existing.status, to: patch.status },
    })
  }

  return c.json({ status: 'ok', item: updated })
})

contactsRoutes.get('/:id/activities', async (c) => {
  const id = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const rows = await db.query.contactActivities.findMany({
    where:   eq(contactActivities.contactId, id),
    orderBy: desc(contactActivities.createdAt),
  })

  return c.json({ status: 'ok', items: rows })
})

contactsRoutes.post('/:id/activities', async (c) => {
  const userId = c.get('userId')
  const id     = c.req.param('id')

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const body    = await c.req.json().catch(() => null) as { content?: string } | null
  const content = body?.content?.trim()
  if (!content) {
    throw new HTTPException(400, { message: 'El contenido de la nota es requerido' })
  }

  const [activity] = await db.insert(contactActivities).values({
    contactId: id, userId, type: 'note', content,
  }).returning()

  return c.json({ status: 'ok', item: activity }, 201)
})

contactsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  await db.delete(contacts).where(eq(contacts.id, id))

  return c.json({ status: 'ok' })
})

export { contactsRoutes }
