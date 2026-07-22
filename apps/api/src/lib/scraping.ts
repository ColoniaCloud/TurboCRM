const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY
const CLAUDE_MODEL        = 'claude-sonnet-5'

export function isScrapingConfigured(): boolean {
  return Boolean(GOOGLE_MAPS_API_KEY && ANTHROPIC_API_KEY)
}

export type PlaceResult = {
  placeId:      string
  name:         string
  address:      string
  phone:        string | null
  website:      string | null
  googleMapsUrl: string | null
  category:     string | null
  rating:       number | null
  reviews:      number | null
}

type GooglePlacesResponse = {
  places?: {
    id: string
    displayName?: { text?: string }
    formattedAddress?: string
    nationalPhoneNumber?: string
    internationalPhoneNumber?: string
    websiteUri?: string
    googleMapsUri?: string
    types?: string[]
    rating?: number
    userRatingCount?: number
  }[]
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY no está configurada')
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'X-Goog-Api-Key':    GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask':  [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.nationalPhoneNumber',
        'places.internationalPhoneNumber',
        'places.websiteUri',
        'places.googleMapsUri',
        'places.types',
        'places.rating',
        'places.userRatingCount',
      ].join(','),
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 20, languageCode: 'es' }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Places respondió ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json() as GooglePlacesResponse

  return (data.places ?? []).map((place) => ({
    placeId:       place.id,
    name:          place.displayName?.text ?? '(sin nombre)',
    address:       place.formattedAddress ?? '',
    phone:         place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    website:       place.websiteUri ?? null,
    googleMapsUrl: place.googleMapsUri ?? null,
    category:      place.types?.[0]?.replace(/_/g, ' ') ?? null,
    rating:        place.rating ?? null,
    reviews:       place.userRatingCount ?? null,
  }))
}

export type LeadAnalysis = {
  score:          number
  reasoning:      string
  openingMessage: string
}

const SYSTEM_PROMPT = `Sos parte del equipo comercial de Colonia Cloud, una agencia de desarrollo web, marketing digital y automatizaciones con IA en Colonia del Sacramento, Uruguay. Tu tono de marca: cercano (tuteo, sin formalismos), claro (sin jerga técnica), optimista, honesto, profesional. Público objetivo: restaurantes, hoteles, comercios locales, profesionales y emprendedores de la zona.

Vas a recibir datos de un negocio encontrado en Google Maps. Tu tarea es evaluar qué tan buen prospecto es para los servicios de Colonia Cloud (sitios web, tiendas online, marketing digital, automatizaciones) y redactar un primer mensaje de WhatsApp para iniciar la conversación.

Respondé ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, con esta forma exacta:
{"score": <número entero del 1 al 5, donde 5 es excelente prospecto>, "reasoning": "<1-2 oraciones explicando el puntaje, en español>", "openingMessage": "<mensaje de WhatsApp de 2-3 oraciones, tono de marca, terminando con una pregunta suave, NO agresivo ni tipo spam>"}`

function buildUserPrompt(place: PlaceResult): string {
  const lines = [
    `Nombre: ${place.name}`,
    `Rubro: ${place.category ?? 'no especificado'}`,
    `Dirección: ${place.address || 'no especificada'}`,
    `¿Tiene sitio web?: ${place.website ? `Sí (${place.website})` : 'No'}`,
    `Calificación en Google: ${place.rating ? `${place.rating} (${place.reviews ?? 0} reseñas)` : 'sin calificación'}`,
  ]
  return lines.join('\n')
}

function parseAnalysis(raw: string): LeadAnalysis {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude no devolvió JSON')

  const parsed = JSON.parse(match[0]) as Partial<LeadAnalysis>
  const score = Number(parsed.score)

  if (!Number.isFinite(score) || !parsed.reasoning || !parsed.openingMessage) {
    throw new Error('Respuesta de Claude incompleta')
  }

  return {
    score:          Math.max(1, Math.min(5, Math.round(score))),
    reasoning:      String(parsed.reasoning),
    openingMessage: String(parsed.openingMessage),
  }
}

export async function callClaude(system: string, prompt: string, maxTokens: number): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no está configurada')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: maxTokens,
      // Sin esto, este modelo piensa "extendido" por default y puede
      // comerse todo el budget de max_tokens pensando, truncando la
      // respuesta antes de cerrarla (visto en pruebas reales). Estas tareas
      // son clasificación/redacción corta, no necesitan razonamiento.
      thinking:   { type: 'disabled' },
      system,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Claude respondió ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json() as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((block) => block.type === 'text')?.text

  if (!text) throw new Error('Claude no devolvió contenido de texto')
  return text
}

export async function analyzeLead(place: PlaceResult): Promise<LeadAnalysis> {
  const text = await callClaude(SYSTEM_PROMPT, buildUserPrompt(place), 500)
  return parseAnalysis(text)
}

// ─── Extracción de email del sitio web ──────────────────────────────────
//
// En vez de pedirle a Claude que "navegue" el sitio (la API de Messages no
// tiene un browser real detrás), el propio servidor trae el HTML y busca
// el email con patrones — es gratis, rápido, y cubre la enorme mayoría de
// sitios de negocios locales (WordPress, landings simples, etc. — todos
// server-rendered). Claude entra en juego solo para el caso ambiguo: varios
// candidatos encontrados y hay que elegir cuál es el de contacto general.
// Limitación conocida: sitios 100% SPA (todo armado con JS en el cliente)
// no van a tener nada en el HTML crudo — no hay forma barata de sortear eso
// sin un navegador real (Puppeteer/Playwright), que no vale la pena para
// este volumen.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

const JUNK_EMAIL_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i,
  /sentry\.io/i,
  /wixpress\.com/i,
  /example\.(com|org)/i,
  /schema\.org/i,
  /godaddy/i,
  /w3\.org/i,
  /\.(gov|edu)$/i, // ruido típico de plantillas/plugins, no de negocios
  /@email\.com$/i, // dominio de placeholder típico de formularios ("tu@email.com")
  /^(tu|your|nombre|name|test|ejemplo|correo|usuario|user)@/i, // local-part de placeholder
]

const PRIORITY_KEYWORDS = ['info', 'contacto', 'contact', 'hola', 'ventas', 'reservas', 'admin']

function isJunkEmail(email: string): boolean {
  return JUNK_EMAIL_PATTERNS.some((pattern) => pattern.test(email))
}

function extractEmailCandidates(html: string): string[] {
  const mailtoMatches = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => m[1])
  const textMatches = html.match(EMAIL_REGEX) ?? []

  const seen = new Set<string>()
  const candidates: string[] = []

  for (const raw of [...mailtoMatches, ...textMatches]) {
    if (!raw) continue
    const email = raw.trim().toLowerCase()
    if (!email || seen.has(email) || isJunkEmail(email)) continue
    seen.add(email)
    candidates.push(email)
  }

  return candidates
}

export async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal:   controller.signal,
      redirect: 'follow',
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; ColoniaCloudCRM/1.0; +https://colonia.cloud)' },
    })

    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return null

    const buf = await res.arrayBuffer()
    if (buf.byteLength > 2_000_000) return null // páginas gigantes, no vale la pena

    return Buffer.from(buf).toString('utf-8')
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function pickBestEmailWithClaude(candidates: string[], businessName: string): Promise<string | null> {
  try {
    const prompt = `Negocio: ${businessName}\nEmails encontrados en su sitio web: ${candidates.join(', ')}\n\n¿Cuál de estos es el mejor email de contacto general del negocio (no un email personal de un empleado, no de soporte técnico externo)? Respondé solo con el email elegido, o con la palabra "ninguno" si ningún candidato parece un contacto de negocio real.`
    const text = await callClaude(
      'Elegís el mejor email de contacto de negocio entre varias opciones. Respondé solo con el email o con "ninguno", sin nada más.',
      prompt,
      50,
    )
    const cleaned = text.trim().toLowerCase()
    if (cleaned === 'ninguno' || !candidates.includes(cleaned)) return null
    return cleaned
  } catch {
    return candidates[0] ?? null // si Claude falla, mejor un candidato que nada
  }
}

async function resolveBestEmail(candidates: string[], businessName: string): Promise<string | null> {
  if (candidates.length === 1) return candidates[0]!

  const prioritized = candidates.find((email) =>
    PRIORITY_KEYWORDS.some((keyword) => email.startsWith(keyword)),
  )
  if (prioritized) return prioritized

  return pickBestEmailWithClaude(candidates, businessName)
}

// ─── Redes sociales ──────────────────────────────────────────────────────
// Google Places no expone redes sociales — solo se pueden sacar del propio
// sitio del negocio (no hace falta una request aparte: se extraen de las
// mismas páginas que ya se traen para buscar el email).

const SOCIAL_PATTERNS: { platform: string; pattern: RegExp }[] = [
  { platform: 'Instagram', pattern: /https?:\/\/(www\.)?instagram\.com\/[^\s"'<>)]+/i },
  { platform: 'Facebook',  pattern: /https?:\/\/(www\.)?facebook\.com\/[^\s"'<>)]+/i },
  { platform: 'TikTok',    pattern: /https?:\/\/(www\.)?tiktok\.com\/[^\s"'<>)]+/i },
  { platform: 'X',         pattern: /https?:\/\/(www\.)?(twitter|x)\.com\/[^\s"'<>)]+/i },
  { platform: 'LinkedIn',  pattern: /https?:\/\/(www\.)?linkedin\.com\/[^\s"'<>)]+/i },
  { platform: 'YouTube',   pattern: /https?:\/\/(www\.)?youtube\.com\/[^\s"'<>)]+/i },
  { platform: 'WhatsApp',  pattern: /https?:\/\/(www\.)?(wa\.me|api\.whatsapp\.com)\/[^\s"'<>)]+/i },
]

export type SocialLink = { platform: string; url: string }

// Muchos sitios tienen botones de "compartir en redes" que apuntan a URLs
// utilitarias (intent/share/sharer/dialog), no al perfil real del negocio,
// o son links de plantilla sin completar ("tu-perfil", "yourprofile") que
// quedaron pegados del theme/template — ambos casos se descartan.
function isNonProfileSocialUrl(url: string): boolean {
  return /\/(intent|share|sharer|dialog)(\/|\.|\?|$)/i.test(url)
    || /\/(tu-perfil|tuperfil|your-profile|yourprofile|username|usuario|tu-usuario)(\/|$)/i.test(url)
}

function extractSocialLinks(html: string): SocialLink[] {
  const links: SocialLink[] = []

  for (const { platform, pattern } of SOCIAL_PATTERNS) {
    const match = html.match(pattern)
    // Corta comillas/paréntesis/backslashes colgantes que a veces quedan
    // pegados al final del match (típico de atributos HTML mal cerrados).
    const url = match?.[0]?.replace(/["')\\]+$/, '')
    if (url && !isNonProfileSocialUrl(url)) {
      links.push({ platform, url })
    }
  }

  return links
}

function mergeSocialLinks(base: SocialLink[], extra: SocialLink[]): SocialLink[] {
  const merged = [...base]
  for (const link of extra) {
    if (!merged.some((existing) => existing.platform === link.platform)) merged.push(link)
  }
  return merged
}

// ─── Descubrir la página de contacto real ───────────────────────────────
// Más confiable que buscar en el footer de la home: el footer suele mezclar
// redes sociales, links legales, etc. Se busca primero un <a> cuyo texto o
// href sugiera que es la página de contacto, y recién si no aparece se
// prueban rutas típicas a ciegas.

const CONTACT_LINK_KEYWORDS = ['contacto', 'contactenos', 'contáctenos', 'contact-us', 'contactus', 'contact', 'escribinos', 'escribenos']

function findContactPageUrl(html: string, baseUrl: string): string | null {
  const anchorRegex = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1]
    const text = match[2]
    if (!href || !text) continue

    const plainText = text.replace(/<[^>]+>/g, ' ').trim().toLowerCase()
    const hrefLower = href.toLowerCase()
    const isContactLink = CONTACT_LINK_KEYWORDS.some((kw) => hrefLower.includes(kw) || plainText.includes(kw))
    if (!isContactLink) continue

    try {
      return new URL(href, baseUrl).toString()
    } catch {
      continue
    }
  }

  return null
}

export type ExtractedContactInfo = {
  email: string | null
  socialLinks: SocialLink[]
}

export async function extractContactInfoFromWebsite(websiteUrl: string, businessName: string): Promise<ExtractedContactInfo> {
  const homeHtml = await fetchHtml(websiteUrl)
  if (!homeHtml) return { email: null, socialLinks: [] }

  let socialLinks = extractSocialLinks(homeHtml)

  // Prioridad 1: la página de contacto real del sitio (más confiable que
  // buscar en el footer de la home). Prioridad 2: rutas típicas a ciegas si
  // no se encontró un link explícito. Prioridad 3 (último recurso): la home
  // misma, que es donde vive el footer.
  const contactPageUrl = findContactPageUrl(homeHtml, websiteUrl)
  const guessedPaths = ['/contacto', '/contact', '/contact-us', '/contactenos', '/es/contacto']

  const candidatePages: string[] = []
  if (contactPageUrl) candidatePages.push(contactPageUrl)
  try {
    const base = new URL(websiteUrl)
    for (const path of guessedPaths) {
      const url = new URL(path, base).toString()
      if (url !== contactPageUrl) candidatePages.push(url)
    }
  } catch {
    // URL inválida — seguimos solo con lo que haya en candidatePages
  }

  for (const page of candidatePages) {
    const html = await fetchHtml(page)
    if (!html) continue

    socialLinks = mergeSocialLinks(socialLinks, extractSocialLinks(html))

    const candidates = extractEmailCandidates(html)
    if (candidates.length === 0) continue

    const email = await resolveBestEmail(candidates, businessName)
    if (email) return { email, socialLinks }
  }

  // Último recurso: la home (footer incluido).
  const homeCandidates = extractEmailCandidates(homeHtml)
  const email = homeCandidates.length > 0 ? await resolveBestEmail(homeCandidates, businessName) : null

  return { email, socialLinks }
}

export type EnrichedPlace = PlaceResult & {
  analysis: LeadAnalysis | null
  analysisError: string | null
  email: string | null
  socialLinks: SocialLink[]
}

export async function searchAndEnrich(query: string): Promise<EnrichedPlace[]> {
  const places = await searchPlaces(query)
  const results: EnrichedPlace[] = []

  // Secuencial entre negocios (evita ráfagas de 20 requests simultáneos
  // contra Anthropic), pero el análisis de Claude y la extracción de
  // email/redes de CADA negocio corren en paralelo entre sí — no hay
  // motivo para esperar uno antes de arrancar el otro.
  for (const place of places) {
    const [analysisResult, contactInfo] = await Promise.all([
      analyzeLead(place).then(
        (analysis) => ({ analysis, analysisError: null as string | null }),
        (err) => ({ analysis: null, analysisError: err instanceof Error ? err.message : 'No se pudo analizar este resultado' }),
      ),
      place.website
        ? extractContactInfoFromWebsite(place.website, place.name).catch(() => ({ email: null, socialLinks: [] }))
        : Promise.resolve({ email: null, socialLinks: [] }),
    ])

    results.push({ ...place, ...analysisResult, email: contactInfo.email, socialLinks: contactInfo.socialLinks })
  }

  return results
}
