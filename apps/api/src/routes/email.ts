import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, and, isNotNull, desc } from 'drizzle-orm'
import { db } from '../db'
import { contacts, contactTags, emailCampaigns } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import { sendEmail, getEmailStatus, isEmailConfigured } from '../lib/email'
import type { HonoVariables } from '../types'
import type { ContactStatus } from '@colonia-crm/shared'

const CONTACT_STATUSES: ContactStatus[] = ['lead', 'prospect', 'client', 'inactive']

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const emailRoutes = new Hono<{ Variables: HonoVariables }>()

emailRoutes.use('*', authMiddleware)

emailRoutes.get('/status', (c) => {
  return c.json({ status: 'ok', ...getEmailStatus() })
})

emailRoutes.post('/send', async (c) => {
  const userId = c.get('userId')
  const body    = await c.req.json().catch(() => null) as { contactId?: string; subject?: string; message?: string } | null
  const subject = body?.subject?.trim()
  const message = body?.message?.trim()

  if (!isEmailConfigured()) {
    throw new HTTPException(400, { message: 'El email todavía no está configurado' })
  }
  if (!body?.contactId || !subject || !message) {
    throw new HTTPException(400, { message: 'contactId, subject y message son requeridos' })
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, body.contactId) })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }
  if (!contact.email) {
    throw new HTTPException(400, { message: 'El contacto no tiene email cargado' })
  }

  try {
    await sendEmail({ to: contact.email, subject, text: message })
  } catch (err) {
    throw new HTTPException(502, { message: err instanceof Error ? err.message : 'No se pudo enviar el email' })
  }

  const activity = await logActivity({
    contactId: contact.id,
    userId,
    type:      'email',
    content:   message,
    metadata:  { direction: 'outgoing', subject },
  })

  return c.json({ status: 'ok', item: activity }, 201)
})

emailRoutes.get('/campaigns', async (c) => {
  const items = await db.query.emailCampaigns.findMany({ orderBy: desc(emailCampaigns.createdAt) })
  return c.json({ status: 'ok', items })
})

emailRoutes.post('/campaigns', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => null) as {
    subject?: string
    message?: string
    status?: string
    tagId?:   string
  } | null

  const subject = body?.subject?.trim()
  const message = body?.message?.trim()

  if (!isEmailConfigured()) {
    throw new HTTPException(400, { message: 'El email todavía no está configurado' })
  }
  if (!subject || !message) {
    throw new HTTPException(400, { message: 'subject y message son requeridos' })
  }

  const conditions = [isNotNull(contacts.email)]
  if (body?.status && CONTACT_STATUSES.includes(body.status as ContactStatus)) {
    conditions.push(eq(contacts.status, body.status as ContactStatus))
  }

  let allowedIds: Set<string> | null = null
  if (body?.tagId) {
    const tagged = await db.query.contactTags.findMany({ where: eq(contactTags.tagId, body.tagId) })
    allowedIds = new Set(tagged.map((row) => row.contactId))
  }

  const candidates = await db.query.contacts.findMany({ where: and(...conditions) })
  const recipients = allowedIds
    ? candidates.filter((contact) => allowedIds!.has(contact.id))
    : candidates

  if (recipients.length === 0) {
    throw new HTTPException(400, { message: 'Ningún contacto coincide con el filtro elegido' })
  }

  let sent   = 0
  let failed = 0

  // Envío secuencial con una pausa chica entre cada uno — la mayoría de
  // hostings de correo compartido (cPanel) aplican límites de envíos por
  // hora y marcan como spam ráfagas de mensajes salientes muy rápidas.
  for (const contact of recipients) {
    if (!contact.email) { failed++; continue }

    try {
      await sendEmail({ to: contact.email, subject, text: message })
      await logActivity({
        contactId: contact.id,
        userId,
        type:      'email',
        content:   message,
        metadata:  { direction: 'outgoing', subject, campaign: true },
      })
      sent++
    } catch {
      failed++
    }

    await sleep(300)
  }

  const [campaign] = await db.insert(emailCampaigns).values({
    subject,
    body:           message,
    recipientCount: sent,
    failedCount:    failed,
  }).returning()

  return c.json({ status: 'ok', item: campaign, sent, failed }, 201)
})

export { emailRoutes }
