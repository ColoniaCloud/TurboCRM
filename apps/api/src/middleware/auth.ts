import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { auth } from '../lib/auth'
import type { HonoVariables } from '../types'

export const authMiddleware = createMiddleware<{
  Variables: HonoVariables
}>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    throw new HTTPException(401, { message: 'No autenticado' })
  }

  c.set('user', session.user)
  c.set('session', session.session)
  c.set('userId', session.user.id)

  await next()
})
