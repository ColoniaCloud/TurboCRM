import { Hono } from 'hono'
import { auth } from '../lib/auth'

const authRoutes = new Hono()

authRoutes.on(['POST', 'GET'], '/*', (c) => {
  return auth.handler(c.req.raw)
})

export { authRoutes }
