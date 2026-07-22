import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../db'
import { paymentSchedules, contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import { computeNextOccurrence } from '../lib/payments'
import type { HonoVariables } from '../types'
import type { DealCurrency, PaymentStatus, PaymentRecurrence } from '@colonia-crm/shared'

const CURRENCIES:   DealCurrency[]      = ['USD', 'UYU', 'ARS', 'CLP', 'BRL']
const STATUSES:     PaymentStatus[]     = ['pending', 'paid', 'overdue', 'cancelled']
const RECURRENCES:  PaymentRecurrence[] = ['none', 'monthly', 'annual']

type PaymentBody = Partial<{
  contactId:           string
  description:         string
  amount:              string
  currency:            DealCurrency
  dueDate:             string
  status:              PaymentStatus
  recurrence:          PaymentRecurrence
  reminderDaysBefore:  number
}>

const paymentsRoutes = new Hono<{ Variables: HonoVariables }>()

paymentsRoutes.use('*', authMiddleware)

paymentsRoutes.get('/', async (c) => {
  const status    = c.req.query('status')
  const contactId = c.req.query('contactId')

  const conditions = []
  if (status && STATUSES.includes(status as PaymentStatus)) {
    conditions.push(eq(paymentSchedules.status, status as PaymentStatus))
  }
  if (contactId) {
    conditions.push(eq(paymentSchedules.contactId, contactId))
  }

  const rows = await db
    .select({
      id:                  paymentSchedules.id,
      contactId:           paymentSchedules.contactId,
      contactName:         contacts.name,
      description:         paymentSchedules.description,
      amount:              paymentSchedules.amount,
      currency:            paymentSchedules.currency,
      dueDate:             paymentSchedules.dueDate,
      status:              paymentSchedules.status,
      recurrence:          paymentSchedules.recurrence,
      reminderDaysBefore:  paymentSchedules.reminderDaysBefore,
      paidAt:              paymentSchedules.paidAt,
      createdAt:           paymentSchedules.createdAt,
    })
    .from(paymentSchedules)
    .leftJoin(contacts, eq(paymentSchedules.contactId, contacts.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(paymentSchedules.dueDate))

  return c.json({ status: 'ok', items: rows })
})

paymentsRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null) as PaymentBody | null

  const description = body?.description?.trim()
  const amount       = body?.amount?.trim()

  if (!body?.contactId || !description || !amount || !body?.dueDate) {
    throw new HTTPException(400, { message: 'contactId, description, amount y dueDate son requeridos' })
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, body.contactId) })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const currency   = body.currency && CURRENCIES.includes(body.currency) ? body.currency : 'USD'
  const recurrence = body.recurrence && RECURRENCES.includes(body.recurrence) ? body.recurrence : 'none'

  const [schedule] = await db.insert(paymentSchedules).values({
    contactId:          body.contactId,
    description,
    amount,
    currency,
    dueDate:            new Date(body.dueDate),
    recurrence,
    reminderDaysBefore: body.reminderDaysBefore ?? 3,
  }).returning()

  return c.json({ status: 'ok', item: schedule }, 201)
})

paymentsRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id     = c.req.param('id')
  const body   = await c.req.json().catch(() => null) as PaymentBody | null

  const existing = await db.query.paymentSchedules.findFirst({ where: eq(paymentSchedules.id, id) })
  if (!existing) {
    throw new HTTPException(404, { message: 'Cobro no encontrado' })
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (body?.description !== undefined)        patch.description = body.description.trim()
  if (body?.amount !== undefined)             patch.amount = body.amount
  if (body?.currency && CURRENCIES.includes(body.currency)) patch.currency = body.currency
  if (body?.dueDate !== undefined)            patch.dueDate = new Date(body.dueDate)
  if (body?.reminderDaysBefore !== undefined) patch.reminderDaysBefore = body.reminderDaysBefore
  if (body?.status && STATUSES.includes(body.status)) {
    patch.status = body.status
    if (body.status === 'paid') patch.paidAt = new Date()
  }

  const [updated] = await db.update(paymentSchedules).set(patch).where(eq(paymentSchedules.id, id)).returning()

  if (body?.status === 'paid' && existing.status !== 'paid') {
    await logActivity({
      contactId: existing.contactId,
      userId,
      type:      'payment_received',
      content:   existing.description,
      metadata:  { scheduleId: existing.id, amount: existing.amount, currency: existing.currency },
    })

    // Cobro recurrente cobrado -> se genera automáticamente el próximo.
    if (existing.recurrence !== 'none') {
      const nextDueDate = computeNextOccurrence(new Date(existing.dueDate), existing.recurrence)
      await db.insert(paymentSchedules).values({
        contactId:          existing.contactId,
        description:        existing.description,
        amount:             existing.amount,
        currency:           existing.currency,
        dueDate:            nextDueDate,
        recurrence:         existing.recurrence,
        reminderDaysBefore: existing.reminderDaysBefore,
      })
    }
  }

  return c.json({ status: 'ok', item: updated })
})

paymentsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.paymentSchedules.findFirst({ where: eq(paymentSchedules.id, id) })
  if (!existing) {
    throw new HTTPException(404, { message: 'Cobro no encontrado' })
  }

  await db.delete(paymentSchedules).where(eq(paymentSchedules.id, id))

  return c.json({ status: 'ok' })
})

export { paymentsRoutes }
