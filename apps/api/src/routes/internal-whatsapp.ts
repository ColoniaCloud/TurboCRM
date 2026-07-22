import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { contacts } from '../db/schema'
import { logActivity } from '../contacts/activity-log'

const WHATSAPP_INTERNAL_SECRET = process.env.WHATSAPP_INTERNAL_SECRET

const internalWhatsappRoutes = new Hono()

// Ruta servicio-a-servicio (apps/whatsapp -> apps/api), no la pisa un usuario
// desde el browser — se protege con un secreto compartido, no con sesión.
internalWhatsappRoutes.use('*', async (c, next) => {
  if (WHATSAPP_INTERNAL_SECRET) {
    const provided = c.req.header('x-internal-secret')
    if (provided !== WHATSAPP_INTERNAL_SECRET) {
      throw new HTTPException(401, { message: 'No autorizado' })
    }
  }
  await next()
})

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

internalWhatsappRoutes.post('/incoming', async (c) => {
  const body    = await c.req.json().catch(() => null) as { phone?: string; message?: string } | null
  const phone   = body?.phone?.trim()
  const message = body?.message?.trim()

  if (!phone || !message) {
    throw new HTTPException(400, { message: 'phone y message son requeridos' })
  }

  // Comparación por los últimos 8 dígitos: el teléfono cargado en el contacto
  // puede tener o no código de país / formato distinto al JID de WhatsApp
  // (que siempre llega en dígitos puros con código de país).
  const incomingDigits = normalizePhone(phone)
  const suffix = incomingDigits.slice(-8)

  const candidates = await db.query.contacts.findMany({ where: isNotNull(contacts.phone) })
  let contact = candidates.find((row) => row.phone && normalizePhone(row.phone).endsWith(suffix))

  if (!contact) {
    const [created] = await db.insert(contacts).values({
      name:   `WhatsApp ${phone}`,
      phone,
      status: 'lead',
    }).returning()

    if (!created) {
      throw new HTTPException(500, { message: 'No se pudo crear el contacto' })
    }

    contact = created
    await logActivity({ contactId: contact.id, type: 'created' })
  }

  await logActivity({
    contactId: contact.id,
    type:      'whatsapp_message',
    content:   message,
    metadata:  { direction: 'incoming' },
  })

  return c.json({ status: 'ok', contactId: contact.id }, 201)
})

export { internalWhatsappRoutes }
