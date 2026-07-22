import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { eq, asc } from 'drizzle-orm'
import { db } from '../db'
import { tags } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { HonoVariables } from '../types'

const tagsRoutes = new Hono<{ Variables: HonoVariables }>()

tagsRoutes.use('*', authMiddleware)

tagsRoutes.get('/', async (c) => {
  const rows = await db.query.tags.findMany({
    orderBy: asc(tags.name),
  })

  return c.json({ status: 'ok', items: rows })
})

tagsRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null) as { name?: string; color?: string } | null

  const name = body?.name?.trim()
  if (!name) {
    throw new HTTPException(400, { message: 'El nombre de la etiqueta es requerido' })
  }

  const existing = await db.query.tags.findFirst({
    where: eq(tags.name, name),
  })
  if (existing) {
    return c.json({ status: 'ok', item: existing })
  }

  const [tag] = await db.insert(tags).values({
    name,
    color: body?.color?.trim() || null,
  }).returning()

  return c.json({ status: 'ok', item: tag }, 201)
})

export { tagsRoutes }
