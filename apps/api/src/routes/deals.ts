import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db'
import { deals, pipelines, pipelineStages, contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'
import type { DealCurrency } from '@colonia-crm/shared'

const CURRENCIES: DealCurrency[] = ['USD', 'UYU', 'ARS', 'CLP', 'BRL']

type DealBody = Partial<{
  title: string
  pipelineId: string
  stageId: string
  contactId: string | null
  value: string
  currency: DealCurrency
}>

const dealsRoutes = new Hono<{ Variables: HonoVariables }>()

dealsRoutes.use('*', authMiddleware)

dealsRoutes.get('/', async (c) => {
  const rows = await db
    .select({
      id:          deals.id,
      pipelineId:  deals.pipelineId,
      stageId:     deals.stageId,
      contactId:   deals.contactId,
      title:       deals.title,
      value:       deals.value,
      currency:    deals.currency,
      createdAt:   deals.createdAt,
      updatedAt:   deals.updatedAt,
      contactName: contacts.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .orderBy(desc(deals.createdAt))

  return c.json({ status: 'ok', items: rows })
})

dealsRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null) as DealBody | null

  const title = body?.title?.trim()
  if (!title) {
    throw new HTTPException(400, { message: 'El título es requerido' })
  }
  if (!body?.pipelineId || !body?.stageId) {
    throw new HTTPException(400, { message: 'pipelineId y stageId son requeridos' })
  }

  const pipeline = await db.query.pipelines.findFirst({
    where: eq(pipelines.id, body.pipelineId),
  })
  if (!pipeline) {
    throw new HTTPException(404, { message: 'Pipeline no encontrado' })
  }

  const stage = await db.query.pipelineStages.findFirst({
    where: and(eq(pipelineStages.id, body.stageId), eq(pipelineStages.pipelineId, pipeline.id)),
  })
  if (!stage) {
    throw new HTTPException(404, { message: 'Etapa no encontrada' })
  }

  if (body.contactId) {
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, body.contactId),
    })
    if (!contact) {
      throw new HTTPException(404, { message: 'Contacto no encontrado' })
    }
  }

  const currency = body.currency && CURRENCIES.includes(body.currency) ? body.currency : 'USD'

  const [deal] = await db.insert(deals).values({
    pipelineId: pipeline.id,
    stageId:    stage.id,
    contactId:  body.contactId || null,
    title,
    value:      body.value?.trim() || '0',
    currency,
  }).returning()

  return c.json({ status: 'ok', item: deal }, 201)
})

dealsRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.deals.findFirst({
    where: eq(deals.id, id),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Deal no encontrado' })
  }

  const body = await c.req.json().catch(() => null) as DealBody | null

  const patch: Record<string, unknown> = { updatedAt: new Date() }

  if (body?.title !== undefined) {
    const title = body.title.trim()
    if (!title) {
      throw new HTTPException(400, { message: 'El título no puede estar vacío' })
    }
    patch.title = title
  }

  if (body?.stageId !== undefined) {
    const stage = await db.query.pipelineStages.findFirst({
      where: and(eq(pipelineStages.id, body.stageId), eq(pipelineStages.pipelineId, existing.pipelineId)),
    })
    if (!stage) {
      throw new HTTPException(404, { message: 'Etapa no encontrada' })
    }
    patch.stageId = stage.id
  }

  if (body?.contactId !== undefined) {
    if (body.contactId) {
      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.id, body.contactId),
      })
      if (!contact) {
        throw new HTTPException(404, { message: 'Contacto no encontrado' })
      }
      patch.contactId = contact.id
    } else {
      patch.contactId = null
    }
  }

  if (body?.value !== undefined) patch.value = body.value.trim() || '0'
  if (body?.currency !== undefined && CURRENCIES.includes(body.currency)) patch.currency = body.currency

  const [updated] = await db.update(deals).set(patch).where(eq(deals.id, id)).returning()

  return c.json({ status: 'ok', item: updated })
})

dealsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.deals.findFirst({
    where: eq(deals.id, id),
  })
  if (!existing) {
    throw new HTTPException(404, { message: 'Deal no encontrado' })
  }

  await db.delete(deals).where(eq(deals.id, id))

  return c.json({ status: 'ok' })
})

export { dealsRoutes }
