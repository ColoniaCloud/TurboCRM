import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { contacts } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { logActivity } from '../contacts/activity-log'
import { isScrapingConfigured, searchAndEnrich, type EnrichedPlace } from '../lib/scraping'
import type { HonoVariables } from '../types'

const scrapingRoutes = new Hono<{ Variables: HonoVariables }>()

scrapingRoutes.use('*', authMiddleware)

scrapingRoutes.get('/status', (c) => {
  const configured = isScrapingConfigured()
  return c.json({
    status: 'ok',
    configured,
    // Detrás de authMiddleware — solo la ve un usuario ya logueado del
    // CRM, no cualquiera en internet (a diferencia de una var
    // NEXT_PUBLIC_*). Hace falta en el cliente para el mapa interactivo:
    // Maps JavaScript API tiene que cargarse en el browser sí o sí.
    mapsApiKey: configured ? process.env.GOOGLE_MAPS_API_KEY ?? null : null,
  })
})

type SearchBody = {
  category?:      string
  country?:       string
  city?:          string
  neighborhood?:  string
  lat?:           number
  lng?:           number
  radiusMeters?:  number
}

scrapingRoutes.post('/search', async (c) => {
  const body     = await c.req.json().catch(() => null) as SearchBody | null
  const category = body?.category?.trim()
  const lat      = Number(body?.lat)
  const lng      = Number(body?.lng)
  const radiusMeters = Number(body?.radiusMeters)

  if (!isScrapingConfigured()) {
    throw new HTTPException(400, { message: 'El scraping todavía no está configurado (GOOGLE_MAPS_API_KEY / ANTHROPIC_API_KEY)' })
  }
  if (!category) {
    throw new HTTPException(400, { message: 'Completá el rubro a buscar, ej. "restaurantes"' })
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters)) {
    throw new HTTPException(400, { message: 'Ubicá el área de búsqueda en el mapa' })
  }

  try {
    const items = await searchAndEnrich({
      category,
      country:      body?.country?.trim() || undefined,
      city:         body?.city?.trim() || undefined,
      neighborhood: body?.neighborhood?.trim() || undefined,
      lat,
      lng,
      radiusMeters,
    })
    return c.json({ status: 'ok', items })
  } catch (err) {
    throw new HTTPException(502, { message: err instanceof Error ? err.message : 'No se pudo completar la búsqueda' })
  }
})

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

scrapingRoutes.post('/import', async (c) => {
  const userId = c.get('userId')
  const body   = await c.req.json().catch(() => null) as { places?: EnrichedPlace[] } | null
  const places = Array.isArray(body?.places) ? body.places : []

  if (places.length === 0) {
    throw new HTTPException(400, { message: 'No seleccionaste ningún resultado para importar' })
  }

  const existing = await db.query.contacts.findMany({ where: isNotNull(contacts.phone) })
  const existingSuffixes = new Set(
    existing.filter((row) => row.phone).map((row) => normalizePhone(row.phone!).slice(-8)),
  )

  let created = 0
  let skipped = 0

  for (const place of places) {
    const suffix = place.phone ? normalizePhone(place.phone).slice(-8) : null

    if (suffix && existingSuffixes.has(suffix)) {
      skipped++
      continue
    }

    const [contact] = await db.insert(contacts).values({
      name:        place.name,
      phone:       place.phone,
      email:       place.email,
      companyName: place.name,
      status:      'lead',
      notes:       place.analysis?.reasoning ?? null,
      customFields: {
        google_place_id: place.placeId,
        google_maps_address: place.address,
        google_maps_url: place.googleMapsUrl,
        website: place.website,
        // customFields solo admite valores primitivos (ver contacts.ts) —
        // cada red social se aplana en su propia clave (social_instagram,
        // social_facebook, etc.) en vez de un array anidado.
        ...Object.fromEntries(place.socialLinks.map((link) => [`social_${link.platform.toLowerCase()}`, link.url])),
      },
    }).returning()

    if (!contact) { skipped++; continue }

    if (suffix) existingSuffixes.add(suffix)
    created++

    await logActivity({ contactId: contact.id, userId, type: 'created' })
    await logActivity({
      contactId: contact.id,
      userId,
      type:      'scrape_enriched',
      content:   place.analysis?.openingMessage ?? null,
      metadata:  {
        source:  'google_maps',
        placeId: place.placeId,
        score:   place.analysis?.score ?? null,
        reasoning: place.analysis?.reasoning ?? null,
      },
    })
  }

  return c.json({ status: 'ok', created, skipped }, 201)
})

export { scrapingRoutes }
