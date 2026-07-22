import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { authRoutes } from './routes/auth'
import { meRoutes } from './routes/me'
import { contactsRoutes } from './routes/contacts'
import { pipelinesRoutes } from './routes/pipelines'
import { dealsRoutes } from './routes/deals'
import { tasksRoutes } from './routes/tasks'
import { tagsRoutes } from './routes/tags'
import { customFieldsRoutes } from './routes/custom-fields'
import { whatsappRoutes } from './routes/whatsapp'
import { internalWhatsappRoutes } from './routes/internal-whatsapp'
import { emailRoutes } from './routes/email'
import { startEmailPolling } from './lib/email'
import { scrapingRoutes } from './routes/scraping'
import { paymentsRoutes } from './routes/payments'
import { startPaymentReminders } from './lib/payments'
import { auditsRoutes, publicAuditsRoutes } from './routes/audits'

const app = new Hono()

// WEB_URL admite una lista separada por comas (útil en prod para el/los
// dominio/s reales). En dev, además, se acepta cualquier origen en
// localhost o una IP de red privada en el puerto del web (3010) — el
// router puede reasignar la IP de la máquina por DHCP en cualquier
// momento (pasó en la práctica: 192.168.1.10 -> .13 y tumbó el login),
// así que fijar una sola IP en WEB_URL es frágil.
const explicitOrigins = (process.env.WEB_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const isProduction = process.env.NODE_ENV === 'production'
const LOCAL_NETWORK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3010$/

function isAllowedOrigin(origin: string): boolean {
  if (explicitOrigins.includes(origin)) return true
  return !isProduction && LOCAL_NETWORK_ORIGIN.test(origin)
}

app.use('*', logger())
app.use('*', cors({
  origin: (origin) => (isAllowedOrigin(origin) ? origin : undefined),
  credentials: true,
}))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ status: 'error', error: err.message }, err.status)
  }
  console.error('Error no manejado:', err)
  return c.json({ status: 'error', error: 'Error interno del servidor' }, 500)
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
  })
})

app.route('/api/auth', authRoutes)
app.route('/api/me', meRoutes)
app.route('/api/contacts', contactsRoutes)
app.route('/api/pipelines', pipelinesRoutes)
app.route('/api/deals', dealsRoutes)
app.route('/api/tasks', tasksRoutes)
app.route('/api/tags', tagsRoutes)
app.route('/api/custom-fields', customFieldsRoutes)
app.route('/api/whatsapp', whatsappRoutes)
app.route('/internal/whatsapp', internalWhatsappRoutes)
app.route('/api/email', emailRoutes)
app.route('/api/scraping', scrapingRoutes)
app.route('/api/payments', paymentsRoutes)
app.route('/api/audits', auditsRoutes)
app.route('/public/audits', publicAuditsRoutes)

const port = Number(process.env.PORT) || 3001
console.log(`API corriendo en http://localhost:${port}`)

serve({ fetch: app.fetch, port })
startEmailPolling()
startPaymentReminders()

export default app
