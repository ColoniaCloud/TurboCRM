import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { projects, projectReminders, projectEnvVars, projectAccounts, projectAccountFiles, contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import type { HonoVariables } from '../types'
import type { ProjectReminderKind, ProjectReminderRecurrence } from '@colonia-crm/shared'

const REMINDER_KINDS: ProjectReminderKind[] = ['hosting', 'domain', 'maintenance', 'other']
const REMINDER_RECURRENCES: ProjectReminderRecurrence[] = ['none', 'monthly', 'quarterly', 'biannual', 'annual']

// Formatos de texto habituales + PDF. Se valida por extensión (no por MIME
// declarado por el browser, que para varios de estos tipos llega como
// application/octet-stream y no sirve para validar nada).
const ALLOWED_FILE_EXTENSIONS = [
  '.txt', '.md', '.csv', '.json', '.log', '.yml', '.yaml', '.xml', '.env', '.pdf',
]
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024

type ProjectBody = Partial<{
  contactId: string
  name: string
  platform: string | null
  url: string | null
  notes: string | null
}>

type ReminderBody = Partial<{
  kind: ProjectReminderKind
  description: string
  amount: number | null
  currency: string
  dueDate: string
  recurrence: ProjectReminderRecurrence
  reminderDaysBefore: number
}>

type EnvVarBody = Partial<{
  name: string
  value: string
}>

type EnvVarImportBody = Partial<{
  vars: Array<{ name?: string; value?: string }>
}>

type AccountBody = Partial<{
  label: string
  value: string
}>

const projectsRoutes = new Hono<{ Variables: HonoVariables }>()
projectsRoutes.use('*', authMiddleware)

async function findProjectOr404(id: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) })
  if (!project) {
    throw new HTTPException(404, { message: 'Proyecto no encontrado' })
  }
  return project
}

async function findAccountOr404(projectId: string, accountId: string) {
  const account = await db.query.projectAccounts.findFirst({ where: eq(projectAccounts.id, accountId) })
  if (!account || account.projectId !== projectId) {
    throw new HTTPException(404, { message: 'Cuenta no encontrada' })
  }
  return account
}

projectsRoutes.get('/', async (c) => {
  const contactId = c.req.query('contactId')
  if (!contactId) {
    throw new HTTPException(400, { message: 'contactId es requerido' })
  }

  const rows = await db.query.projects.findMany({
    where: eq(projects.contactId, contactId),
    orderBy: desc(projects.createdAt),
  })

  return c.json({ status: 'ok', items: rows })
})

projectsRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null) as ProjectBody | null

  const contactId = body?.contactId
  const name = body?.name?.trim()
  if (!contactId) {
    throw new HTTPException(400, { message: 'contactId es requerido' })
  }
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre es requerido' })
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const [project] = await db.insert(projects).values({
    contactId,
    name,
    platform: body?.platform?.trim() || null,
    url: body?.url?.trim() || null,
    notes: body?.notes?.trim() || null,
  }).returning()

  await logActivity({
    contactId,
    type: 'project_created',
    content: `Proyecto "${project!.name}" creado`,
    metadata: { projectId: project!.id },
  })

  return c.json({ status: 'ok', item: project }, 201)
})

projectsRoutes.get('/:id', async (c) => {
  const project = await findProjectOr404(c.req.param('id'))
  return c.json({ status: 'ok', item: project })
})

projectsRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  await findProjectOr404(id)

  const body = await c.req.json().catch(() => null) as ProjectBody | null

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.name !== undefined) {
    const name = body.name.trim()
    if (!name) {
      throw new HTTPException(400, { message: 'El nombre no puede estar vacío' })
    }
    patch.name = name
  }
  if (body?.platform !== undefined) patch.platform = body.platform?.trim() || null
  if (body?.url !== undefined) patch.url = body.url?.trim() || null
  if (body?.notes !== undefined) patch.notes = body.notes?.trim() || null

  const [updated] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning()
  return c.json({ status: 'ok', item: updated })
})

projectsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await findProjectOr404(id)
  await db.delete(projects).where(eq(projects.id, id))
  return c.json({ status: 'ok' })
})

projectsRoutes.get('/:id/reminders', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const rows = await db.query.projectReminders.findMany({
    where: eq(projectReminders.projectId, projectId),
    orderBy: projectReminders.dueDate,
  })

  return c.json({ status: 'ok', items: rows })
})

projectsRoutes.post('/:id/reminders', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const body = await c.req.json().catch(() => null) as ReminderBody | null

  const description = body?.description?.trim()
  if (!body?.kind || !REMINDER_KINDS.includes(body.kind)) {
    throw new HTTPException(400, { message: 'Tipo de vencimiento inválido' })
  }
  if (!description) {
    throw new HTTPException(400, { message: 'La descripción es requerida' })
  }
  if (!body?.dueDate) {
    throw new HTTPException(400, { message: 'La fecha de vencimiento es requerida' })
  }
  const recurrence = body.recurrence && REMINDER_RECURRENCES.includes(body.recurrence) ? body.recurrence : 'none'

  const [reminder] = await db.insert(projectReminders).values({
    projectId,
    kind: body.kind,
    description,
    amount: body.amount != null ? String(body.amount) : null,
    currency: body.currency?.trim() || 'USD',
    dueDate: new Date(body.dueDate),
    recurrence,
    reminderDaysBefore: body.reminderDaysBefore ?? 7,
  }).returning()

  return c.json({ status: 'ok', item: reminder }, 201)
})

projectsRoutes.patch('/:id/reminders/:reminderId', async (c) => {
  const projectId = c.req.param('id')
  const reminderId = c.req.param('reminderId')
  await findProjectOr404(projectId)

  const existing = await db.query.projectReminders.findFirst({ where: eq(projectReminders.id, reminderId) })
  if (!existing || existing.projectId !== projectId) {
    throw new HTTPException(404, { message: 'Vencimiento no encontrado' })
  }

  const body = await c.req.json().catch(() => null) as ReminderBody | null

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.kind !== undefined) {
    if (!REMINDER_KINDS.includes(body.kind)) {
      throw new HTTPException(400, { message: 'Tipo de vencimiento inválido' })
    }
    patch.kind = body.kind
  }
  if (body?.description !== undefined) {
    const description = body.description.trim()
    if (!description) {
      throw new HTTPException(400, { message: 'La descripción no puede estar vacía' })
    }
    patch.description = description
  }
  if (body?.amount !== undefined) patch.amount = body.amount != null ? String(body.amount) : null
  if (body?.currency !== undefined) patch.currency = body.currency?.trim() || 'USD'
  if (body?.dueDate !== undefined) patch.dueDate = new Date(body.dueDate)
  if (body?.recurrence !== undefined) {
    if (!REMINDER_RECURRENCES.includes(body.recurrence)) {
      throw new HTTPException(400, { message: 'Recurrencia inválida' })
    }
    patch.recurrence = body.recurrence
  }
  if (body?.reminderDaysBefore !== undefined) patch.reminderDaysBefore = body.reminderDaysBefore

  const [updated] = await db.update(projectReminders).set(patch).where(eq(projectReminders.id, reminderId)).returning()
  return c.json({ status: 'ok', item: updated })
})

projectsRoutes.delete('/:id/reminders/:reminderId', async (c) => {
  const projectId = c.req.param('id')
  const reminderId = c.req.param('reminderId')
  await findProjectOr404(projectId)

  const existing = await db.query.projectReminders.findFirst({ where: eq(projectReminders.id, reminderId) })
  if (!existing || existing.projectId !== projectId) {
    throw new HTTPException(404, { message: 'Vencimiento no encontrado' })
  }

  await db.delete(projectReminders).where(eq(projectReminders.id, reminderId))
  return c.json({ status: 'ok' })
})

projectsRoutes.get('/:id/env-vars', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const rows = await db.query.projectEnvVars.findMany({
    where: eq(projectEnvVars.projectId, projectId),
    orderBy: desc(projectEnvVars.createdAt),
  })

  return c.json({ status: 'ok', items: rows })
})

projectsRoutes.post('/:id/env-vars', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const body = await c.req.json().catch(() => null) as EnvVarBody | null

  const name = body?.name?.trim()
  const value = body?.value?.trim()
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre es requerido' })
  }
  if (!value) {
    throw new HTTPException(400, { message: 'El valor es requerido' })
  }

  const [envVar] = await db.insert(projectEnvVars).values({ projectId, name, value }).returning()

  return c.json({ status: 'ok', item: envVar }, 201)
})

// Alta masiva a partir de un archivo .env parseado del lado del cliente
// (ver KEY=VALUE por línea, comentarios con # e ignorados). Inserta todas
// las entradas válidas de una sola vez.
projectsRoutes.post('/:id/env-vars/import', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const body = await c.req.json().catch(() => null) as EnvVarImportBody | null

  const entries = (body?.vars ?? [])
    .map((v) => ({ name: v.name?.trim() ?? '', value: v.value?.trim() ?? '' }))
    .filter((v) => v.name && v.value)

  if (entries.length === 0) {
    throw new HTTPException(400, { message: 'No se encontraron variables válidas para importar' })
  }

  const inserted = await db.insert(projectEnvVars)
    .values(entries.map((v) => ({ projectId, name: v.name, value: v.value })))
    .returning()

  return c.json({ status: 'ok', items: inserted }, 201)
})

projectsRoutes.delete('/:id/env-vars/:envVarId', async (c) => {
  const projectId = c.req.param('id')
  const envVarId = c.req.param('envVarId')
  await findProjectOr404(projectId)

  const existing = await db.query.projectEnvVars.findFirst({ where: eq(projectEnvVars.id, envVarId) })
  if (!existing || existing.projectId !== projectId) {
    throw new HTTPException(404, { message: 'Variable de entorno no encontrada' })
  }

  await db.delete(projectEnvVars).where(eq(projectEnvVars.id, envVarId))
  return c.json({ status: 'ok' })
})

projectsRoutes.get('/:id/accounts', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const rows = await db.query.projectAccounts.findMany({
    where: eq(projectAccounts.projectId, projectId),
    orderBy: desc(projectAccounts.createdAt),
  })

  return c.json({ status: 'ok', items: rows })
})

projectsRoutes.post('/:id/accounts', async (c) => {
  const projectId = c.req.param('id')
  await findProjectOr404(projectId)

  const body = await c.req.json().catch(() => null) as AccountBody | null

  const label = body?.label?.trim()
  const value = body?.value?.trim()
  if (!label) {
    throw new HTTPException(400, { message: 'El servicio es requerido' })
  }
  if (!value) {
    throw new HTTPException(400, { message: 'La cuenta/identificador es requerido' })
  }

  const [account] = await db.insert(projectAccounts).values({ projectId, label, value }).returning()

  return c.json({ status: 'ok', item: account }, 201)
})

projectsRoutes.patch('/:id/accounts/:accountId', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')
  await findAccountOr404(projectId, accountId)

  const body = await c.req.json().catch(() => null) as AccountBody | null

  const patch: Record<string, unknown> = {}
  if (body?.label !== undefined) {
    const label = body.label.trim()
    if (!label) {
      throw new HTTPException(400, { message: 'El servicio no puede estar vacío' })
    }
    patch.label = label
  }
  if (body?.value !== undefined) {
    const value = body.value.trim()
    if (!value) {
      throw new HTTPException(400, { message: 'La cuenta no puede estar vacía' })
    }
    patch.value = value
  }

  const [updated] = await db.update(projectAccounts).set(patch).where(eq(projectAccounts.id, accountId)).returning()
  return c.json({ status: 'ok', item: updated })
})

projectsRoutes.delete('/:id/accounts/:accountId', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')
  await findAccountOr404(projectId, accountId)

  await db.delete(projectAccounts).where(eq(projectAccounts.id, accountId))
  return c.json({ status: 'ok' })
})

projectsRoutes.get('/:id/accounts/:accountId/files', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')
  await findAccountOr404(projectId, accountId)

  const rows = await db.query.projectAccountFiles.findMany({
    where: eq(projectAccountFiles.accountId, accountId),
    orderBy: desc(projectAccountFiles.createdAt),
    columns: { id: true, accountId: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
  })

  return c.json({ status: 'ok', items: rows })
})

projectsRoutes.post('/:id/accounts/:accountId/files', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')
  await findAccountOr404(projectId, accountId)

  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file

  if (!file || typeof file === 'string' || Array.isArray(file)) {
    throw new HTTPException(400, { message: 'Archivo requerido' })
  }

  const fileName = file.name
  const dotIndex = fileName.lastIndexOf('.')
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    throw new HTTPException(400, { message: `Formato no permitido (${ext || 'sin extensión'}). Solo texto plano o PDF.` })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new HTTPException(400, { message: 'El archivo supera el límite de 8MB' })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const [saved] = await db.insert(projectAccountFiles).values({
    accountId,
    fileName,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    fileData: buffer.toString('base64'),
  }).returning({
    id: projectAccountFiles.id,
    accountId: projectAccountFiles.accountId,
    fileName: projectAccountFiles.fileName,
    mimeType: projectAccountFiles.mimeType,
    fileSize: projectAccountFiles.fileSize,
    createdAt: projectAccountFiles.createdAt,
  })

  return c.json({ status: 'ok', item: saved }, 201)
})

projectsRoutes.get('/:id/accounts/:accountId/files/:fileId', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')
  const fileId = c.req.param('fileId')
  await findAccountOr404(projectId, accountId)

  const file = await db.query.projectAccountFiles.findFirst({ where: eq(projectAccountFiles.id, fileId) })
  if (!file || file.accountId !== accountId) {
    throw new HTTPException(404, { message: 'Archivo no encontrado' })
  }

  const buffer = Buffer.from(file.fileData, 'base64')
  c.header('Content-Type', file.mimeType)
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`)
  return c.body(buffer)
})

projectsRoutes.delete('/:id/accounts/:accountId/files/:fileId', async (c) => {
  const projectId = c.req.param('id')
  const accountId = c.req.param('accountId')
  const fileId = c.req.param('fileId')
  await findAccountOr404(projectId, accountId)

  const file = await db.query.projectAccountFiles.findFirst({ where: eq(projectAccountFiles.id, fileId) })
  if (!file || file.accountId !== accountId) {
    throw new HTTPException(404, { message: 'Archivo no encontrado' })
  }

  await db.delete(projectAccountFiles).where(eq(projectAccountFiles.id, fileId))
  return c.json({ status: 'ok' })
})

export { projectsRoutes }
