import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import { getWhatsAppStatus, sendWhatsAppMessage, logoutWhatsApp } from '../lib/whatsapp-client'
import type { HonoVariables } from '../types'

const whatsappRoutes = new Hono<{ Variables: HonoVariables }>()

whatsappRoutes.use('*', authMiddleware)

whatsappRoutes.get('/status', async (c) => {
  try {
    const status = await getWhatsAppStatus()
    return c.json({ status: 'ok', ...status })
  } catch (err) {
    throw new HTTPException(502, { message: err instanceof Error ? err.message : 'No se pudo consultar el estado de WhatsApp' })
  }
})

whatsappRoutes.post('/logout', async (c) => {
  try {
    await logoutWhatsApp()
  } catch (err) {
    throw new HTTPException(502, { message: err instanceof Error ? err.message : 'No se pudo cerrar la sesión de WhatsApp' })
  }
  return c.json({ status: 'ok' })
})

whatsappRoutes.post('/send', async (c) => {
  const userId = c.get('userId')
  const body    = await c.req.json().catch(() => null) as { contactId?: string; message?: string } | null
  const message = body?.message?.trim()

  if (!body?.contactId || !message) {
    throw new HTTPException(400, { message: 'contactId y message son requeridos' })
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, body.contactId) })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }
  if (!contact.phone) {
    throw new HTTPException(400, { message: 'El contacto no tiene teléfono cargado' })
  }

  try {
    await sendWhatsAppMessage(contact.phone, message)
  } catch (err) {
    throw new HTTPException(502, { message: err instanceof Error ? err.message : 'No se pudo enviar el mensaje de WhatsApp' })
  }

  const activity = await logActivity({
    contactId: contact.id,
    userId,
    type:      'whatsapp_message',
    content:   message,
    metadata:  { direction: 'outgoing' },
  })

  return c.json({ status: 'ok', item: activity }, 201)
})

export { whatsappRoutes }
