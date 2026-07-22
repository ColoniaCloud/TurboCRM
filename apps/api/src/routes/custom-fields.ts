import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../db'
import { customFieldDefinitions, user } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'
import type { CustomFieldType, CustomFieldEntityType } from '@colonia-crm/shared'

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'boolean', 'select']
const ENTITY_TYPES: CustomFieldEntityType[] = ['contact']

const customFieldsRoutes = new Hono<{ Variables: HonoVariables }>()

customFieldsRoutes.use('*', authMiddleware)

async function requireAdmin(userId: string) {
  const row = await db.query.user.findFirst({ where: eq(user.id, userId) })
  if (!row || row.role !== 'admin') {
    throw new HTTPException(403, { message: 'Solo un admin puede gestionar los campos personalizados' })
  }
}

customFieldsRoutes.get('/', async (c) => {
  const entityType = (c.req.query('entityType') ?? 'contact') as CustomFieldEntityType

  if (!ENTITY_TYPES.includes(entityType)) {
    throw new HTTPException(400, { message: 'entityType inválido' })
  }

  const rows = await db.query.customFieldDefinitions.findMany({
    where:   eq(customFieldDefinitions.entityType, entityType),
    orderBy: asc(customFieldDefinitions.position),
  })

  return c.json({ status: 'ok', items: rows })
})

customFieldsRoutes.post('/', async (c) => {
  const userId = c.get('userId')

  await requireAdmin(userId)

  const body = await c.req.json().catch(() => null) as Partial<{
    key: string
    label: string
    fieldType: CustomFieldType
    options: string[]
    required: boolean
    entityType: CustomFieldEntityType
  }> | null

  const key   = body?.key?.trim()
  const label = body?.label?.trim()

  if (!key || !/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new HTTPException(400, { message: 'La key debe ser minúscula, sin espacios (ej. "membresia_vencimiento")' })
  }
  if (!label) {
    throw new HTTPException(400, { message: 'El label es requerido' })
  }
  if (!body?.fieldType || !FIELD_TYPES.includes(body.fieldType)) {
    throw new HTTPException(400, { message: 'Tipo de campo inválido' })
  }
  if (body.fieldType === 'select' && (!Array.isArray(body.options) || body.options.length === 0)) {
    throw new HTTPException(400, { message: 'Un campo de tipo "select" necesita al menos una opción' })
  }

  const entityType = body.entityType && ENTITY_TYPES.includes(body.entityType) ? body.entityType : 'contact'

  const existing = await db.query.customFieldDefinitions.findFirst({
    where: and(
      eq(customFieldDefinitions.entityType, entityType),
      eq(customFieldDefinitions.key, key),
    ),
  })
  if (existing) {
    throw new HTTPException(409, { message: 'Ya existe un campo con esa key' })
  }

  const [definition] = await db.insert(customFieldDefinitions).values({
    entityType,
    key,
    label,
    fieldType: body.fieldType,
    options:   body.fieldType === 'select' ? body.options ?? null : null,
    required:  Boolean(body.required),
  }).returning()

  return c.json({ status: 'ok', item: definition }, 201)
})

customFieldsRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id     = c.req.param('id')

  await requireAdmin(userId)

  const existing = await db.query.customFieldDefinitions.findFirst({
    where: eq(customFieldDefinitions.id, id),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Campo no encontrado' })
  }

  await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id))

  return c.json({ status: 'ok' })
})

export { customFieldsRoutes }
