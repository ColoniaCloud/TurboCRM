import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { getStatus, sendMessage, logout, startSocket } from './baileys'

const WHATSAPP_INTERNAL_SECRET = process.env.WHATSAPP_INTERNAL_SECRET

const app = new Hono()

app.use('*', honoLogger())

// Servicio interno, no expuesto a usuarios finales — solo apps/api le habla.
// /health queda afuera para que un health check de infraestructura no
// necesite el secreto.
app.use('*', async (c, next) => {
  if (WHATSAPP_INTERNAL_SECRET && c.req.path !== '/health') {
    const provided = c.req.header('x-internal-secret')
    if (provided !== WHATSAPP_INTERNAL_SECRET) {
      throw new HTTPException(401, { message: 'No autorizado' })
    }
  }
  await next()
})

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ status: 'error', error: err.message }, err.status)
  }
  console.error('Error no manejado:', err)
  return c.json({ status: 'error', error: err instanceof Error ? err.message : 'Error interno' }, 500)
})

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/status', (c) => c.json({ status: 'ok', ...getStatus() }))

app.post('/send', async (c) => {
  const body = await c.req.json().catch(() => null) as { phone?: string; message?: string } | null

  if (!body?.phone || !body?.message) {
    throw new HTTPException(400, { message: 'phone y message son requeridos' })
  }

  await sendMessage(body.phone, body.message)
  return c.json({ status: 'ok' })
})

app.post('/logout', async (c) => {
  await logout()
  return c.json({ status: 'ok' })
})

const port = Number(process.env.PORT) || 3002

startSocket().catch((err) => {
  console.error('No se pudo iniciar la sesión de WhatsApp:', err)
})

console.log(`Servicio de WhatsApp corriendo en http://localhost:${port}`)
serve({ fetch: app.fetch, port })

export default app
