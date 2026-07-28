import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { projects, projectReminders, projectEnvVars, contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import type { HonoVariables } from '../types'
import type { ProjectReminderKind, ProjectReminderRecurrence } from '@colonia-crm/shared'

const REMINDER_KINDS: ProjectReminderKind[] = ['hosting', 'domain', 'maintenance', 'other']
const REMINDER_RECURRENCES: ProjectReminderRecurrence[] = ['none', 'monthly', 'quarterly', 'biannual', 'annual']

type ProjectBody = Partial<{
  contactId: string
  name: string
  platform: string | null
  url: string | null
  notes: string | null
  accounts: Record<string, string>
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

const projectsRoutes = new Hono<{ Variables: HonoVariables }>()
projectsRoutes.use('*', authMiddleware)

async function findProjectOr404(id: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) })
  if (!project) {
    throw new HTTPException(404, { message: 'Proyecto no encontrado' })
  }
  return project
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
  const existing = await findProjectOr404(id)

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
  if (body?.accounts !== undefined) {
    patch.accounts = { ...existing.accounts, ...body.accounts }
  }

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

export { projectsRoutes }
