import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'

const meRoutes = new Hono<{ Variables: HonoVariables }>()

meRoutes.get('/', authMiddleware, async (c) => {
  const user = c.get('user')

  return c.json({
    status: 'ok',
    user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    },
  })
})

export { meRoutes }
