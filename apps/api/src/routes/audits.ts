import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { audits, contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import { collectSiteFacts, generateAudit, renderAuditHtml } from '../lib/audit'
import { isScrapingConfigured } from '../lib/scraping'
import type { HonoVariables } from '../types'

const API_PUBLIC_URL = process.env.API_PUBLIC_URL ?? 'http://localhost:3001'

function publicUrlFor(publicId: string): string {
  return `${API_PUBLIC_URL}/public/audits/${publicId}`
}

const auditsRoutes = new Hono<{ Variables: HonoVariables }>()

auditsRoutes.use('*', authMiddleware)

auditsRoutes.get('/', async (c) => {
  const contactId = c.req.query('contactId')
  if (!contactId) {
    throw new HTTPException(400, { message: 'contactId es requerido' })
  }

  const rows = await db.query.audits.findMany({
    where:   eq(audits.contactId, contactId),
    orderBy: desc(audits.createdAt),
  })

  return c.json({
    status: 'ok',
    items: rows.map((row) => ({ ...row, publicUrl: publicUrlFor(row.publicId) })),
  })
})

auditsRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body   = await c.req.json().catch(() => null) as { contactId?: string } | null

  if (!isScrapingConfigured()) {
    throw new HTTPException(400, { message: 'Falta ANTHROPIC_API_KEY en el .env del servidor' })
  }
  if (!body?.contactId) {
    throw new HTTPException(400, { message: 'contactId es requerido' })
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, body.contactId) })
  if (!contact) {
    throw new HTTPException(404, { message: 'Contacto no encontrado' })
  }

  const fields  = contact.customFields as Record<string, unknown>
  const website = typeof fields.website === 'string' ? fields.website : null
  const address = typeof fields.google_maps_address === 'string' ? fields.google_maps_address : null

  try {
    const facts = website ? await collectSiteFacts(website) : null
    const data  = await generateAudit({
      name:     contact.companyName ?? contact.name,
      category: null,
      address,
      website,
      facts,
    })

    const [audit] = await db.insert(audits).values({
      contactId: contact.id,
      publicId:  randomBytes(16).toString('hex'),
      data,
    }).returning()

    if (!audit) {
      throw new Error('No se pudo guardar la auditoría')
    }

    await logActivity({
      contactId: contact.id,
      userId,
      type:      'audit_generated',
      content:   data.resumen,
      metadata:  { auditId: audit.id, publicId: audit.publicId, tipo: data.tipo },
    })

    return c.json({ status: 'ok', item: { ...audit, publicUrl: publicUrlFor(audit.publicId) } }, 201)
  } catch (err) {
    throw new HTTPException(502, { message: err instanceof Error ? err.message : 'No se pudo generar la auditoría' })
  }
})

auditsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await db.query.audits.findFirst({ where: eq(audits.id, id) })
  if (!existing) {
    throw new HTTPException(404, { message: 'Auditoría no encontrada' })
  }

  await db.delete(audits).where(eq(audits.id, id))
  return c.json({ status: 'ok' })
})

// ─── Informe público ─────────────────────────────────────────────────────
// Sin autenticación: es la página que abre el prospecto desde el link que
// le llega por WhatsApp/email. El publicId (token random de 32 hex) es la
// única protección — suficiente para un informe pensado para compartirse.

const publicAuditsRoutes = new Hono()

publicAuditsRoutes.get('/:publicId', async (c) => {
  const publicId = c.req.param('publicId')

  const audit = await db.query.audits.findFirst({ where: eq(audits.publicId, publicId) })
  if (!audit) {
    return c.html('<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;padding:40px;text-align:center"><p>Este informe no existe o fue eliminado.</p></body></html>', 404)
  }

  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, audit.contactId) })
  const businessName = contact?.companyName ?? contact?.name ?? 'tu negocio'

  return c.html(renderAuditHtml(businessName, audit))
})

export { auditsRoutes, publicAuditsRoutes }
