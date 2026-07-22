import { callClaude, fetchHtml } from './scraping'
import type { AuditData, AuditFinding, Audit } from '../db/schema/audits'

// ─── Recolección de datos duros del sitio ────────────────────────────────
// Todo lo verificable se chequea acá con código, no con IA: la auditoría
// gana credibilidad porque cada hallazgo sale de un dato real del sitio.
// Claude recibe estos hechos y solo pone la interpretación y la redacción.

export type SiteFacts = {
  reachable:          boolean
  https:              boolean
  title:              string | null
  metaDescription:    boolean
  viewportMeta:       boolean
  h1Count:            number
  ogTags:             boolean
  copyrightYear:      number | null
  bookingSignals:     boolean
  ecommerceSignals:   boolean
  socialCount:        number
  emailVisible:       boolean
  pageWeightKb:       number | null
  imgCount:           number
  builder:            string | null
}

const BOOKING_KEYWORDS = /reserv(a|á|ar|as)|booking|book now|disponibilidad|cloudbeds|bookeo|calendly/i
const ECOMMERCE_KEYWORDS = /carrito|agregar al carrito|comprar ahora|checkout|woocommerce|shopify|tiendanube|mercadoshops/i

function detectBuilder(html: string): string | null {
  if (/wp-content|wordpress/i.test(html)) return 'WordPress'
  if (/wix\.com|wixstatic/i.test(html)) return 'Wix'
  if (/shopify/i.test(html)) return 'Shopify'
  if (/squarespace/i.test(html)) return 'Squarespace'
  if (/tiendanube/i.test(html)) return 'Tiendanube'
  return null
}

export async function collectSiteFacts(websiteUrl: string): Promise<SiteFacts> {
  const html = await fetchHtml(websiteUrl, 10000)

  if (!html) {
    return {
      reachable: false, https: websiteUrl.startsWith('https'), title: null,
      metaDescription: false, viewportMeta: false, h1Count: 0, ogTags: false,
      copyrightYear: null, bookingSignals: false, ecommerceSignals: false,
      socialCount: 0, emailVisible: false, pageWeightKb: null, imgCount: 0,
      builder: null,
    }
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const copyrightMatch = html.match(/(?:©|&copy;|copyright)[^\d]{0,20}(20\d{2})/i)

  return {
    reachable:        true,
    https:            websiteUrl.startsWith('https'),
    title:            titleMatch?.[1]?.trim().slice(0, 120) ?? null,
    metaDescription:  /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html),
    viewportMeta:     /<meta[^>]+name=["']viewport["']/i.test(html),
    h1Count:          (html.match(/<h1[\s>]/gi) ?? []).length,
    ogTags:           /<meta[^>]+property=["']og:/i.test(html),
    copyrightYear:    copyrightMatch?.[1] ? Number(copyrightMatch[1]) : null,
    bookingSignals:   BOOKING_KEYWORDS.test(html),
    ecommerceSignals: ECOMMERCE_KEYWORDS.test(html),
    socialCount:      ['instagram.com', 'facebook.com', 'tiktok.com', 'wa.me'].filter((s) => html.includes(s)).length,
    emailVisible:     /mailto:/i.test(html),
    pageWeightKb:     Math.round(Buffer.byteLength(html, 'utf-8') / 1024),
    imgCount:         (html.match(/<img[\s>]/gi) ?? []).length,
    builder:          detectBuilder(html),
  }
}

// ─── Generación del informe con Claude ──────────────────────────────────

// Resumen del catálogo real (04-productos-servicios.md) — Claude solo puede
// recomendar servicios que existen, con sus precios reales.
const CATALOG = `SERVICIOS DE COLONIA CLOUD (precios reales, usar solo estos):
- Sitio esencial (WordPress, hasta 5 páginas, SEO básico, responsive): desde USD 250
- Tienda online (WooCommerce, catálogo + carrito + pagos): desde USD 400
- Sitio premium (desarrollo propio, diseño exclusivo): desde USD 600
- Tienda online premium (desarrollo propio, rápida y escalable): desde USD 800
- Hosting + dominio + soporte (anual): desde USD 200/año
- Marketing digital "Presencia activa" (gestión de redes, 8-12 publicaciones/mes): desde USD 100/mes
- Marketing digital "Crecimiento" (redes + Meta Ads + Google Business): cotización a medida
- Automatización "Flujo simple" (ej. respuestas automáticas de WhatsApp): desde USD 400
- Automatización "Sistema integrado" (CRM, reservas, pagos, IA): cotización a medida`

const AUDIT_SYSTEM = `Sos el equipo técnico de Colonia Cloud, agencia de desarrollo web, marketing y automatizaciones de Colonia del Sacramento, Uruguay. Redactás auditorías digitales gratuitas para negocios locales. Tono de marca: cercano (tuteo rioplatense), claro (CERO jerga técnica — el lector es el dueño de un restaurante u hotel, no un programador), honesto (nunca inventar problemas que los datos no muestran), optimista pero concreto.

${CATALOG}

Vas a recibir datos VERIFICADOS de un negocio (de Google Maps y de un análisis técnico real de su sitio web si tiene). Generá una auditoría con:
- Un resumen ejecutivo de 2-3 oraciones, directo y específico para ESTE negocio.
- Puntajes del 1 al 10 en 4 áreas: presencia (visibilidad online general), seo (qué tan encontrable es en Google), mobile (experiencia en celular), conversion (capacidad de convertir visitas en clientes/reservas).
- Entre 3 y 5 hallazgos. Cada hallazgo: titulo (corto, sin alarmar), detalle (2-3 oraciones simples explicando qué pasa y qué cuesta al negocio), servicio (el servicio del catálogo que lo resuelve, nombre exacto), precio (el precio del catálogo, ej. "desde USD 250"). Basate SOLO en los datos recibidos — si un dato está bien, puede ser un hallazgo positivo (reconocelo, da credibilidad).
- Un whatsappMessage de 2-3 oraciones para mandarle al dueño: mencioná 1-2 hallazgos concretos, avisá que la auditoría completa es gratis y está en un link (NO incluyas el link, se agrega después), terminá con pregunta suave. Sin tono de spam.

Respondé ÚNICAMENTE con JSON válido, sin texto antes ni después:
{"resumen": "...", "scores": {"presencia": n, "seo": n, "mobile": n, "conversion": n}, "hallazgos": [{"titulo": "...", "detalle": "...", "servicio": "...", "precio": "..."}], "whatsappMessage": "..."}`

type AuditInput = {
  name:        string
  category:    string | null
  address:     string | null
  website:     string | null
  facts:       SiteFacts | null
}

function buildAuditPrompt(input: AuditInput): string {
  const lines = [
    `Negocio: ${input.name}`,
    `Rubro: ${input.category ?? 'no especificado'}`,
    `Dirección: ${input.address ?? 'no especificada'}`,
  ]

  if (!input.website || !input.facts) {
    lines.push('', 'SITIO WEB: NO TIENE. Esta es una auditoría de oportunidad — el foco es qué pierde un negocio así sin presencia web propia (reservas/ventas directas, aparecer en Google, depender solo de terceros) y qué servicio lo resuelve.')
    return lines.join('\n')
  }

  const f = input.facts
  lines.push('', `SITIO WEB: ${input.website}`, 'Análisis técnico real del sitio:')

  if (!f.reachable) {
    lines.push('- EL SITIO NO CARGA o tarda más de 10 segundos — dato crítico, un sitio caído es peor que no tener sitio.')
    return lines.join('\n')
  }

  lines.push(
    `- Conexión segura (candado HTTPS): ${f.https ? 'sí' : 'NO — los navegadores lo marcan como "no seguro"'}`,
    `- Título de la página para Google: ${f.title ? `"${f.title}"` : 'FALTA'}`,
    `- Descripción para resultados de Google (meta description): ${f.metaDescription ? 'sí' : 'FALTA'}`,
    `- Adaptado a celular (viewport): ${f.viewportMeta ? 'sí' : 'NO'}`,
    `- Encabezado principal H1: ${f.h1Count === 1 ? 'correcto' : f.h1Count === 0 ? 'FALTA' : `hay ${f.h1Count} (debería haber 1)`}`,
    `- Vista previa al compartir en redes (Open Graph): ${f.ogTags ? 'sí' : 'FALTA'}`,
    `- Sistema de reservas online: ${f.bookingSignals ? 'sí' : 'no se detectó'}`,
    `- Venta online: ${f.ecommerceSignals ? 'sí' : 'no se detectó'}`,
    `- Redes sociales enlazadas: ${f.socialCount}`,
    `- Email de contacto visible: ${f.emailVisible ? 'sí' : 'no'}`,
  )

  if (f.copyrightYear && f.copyrightYear < new Date().getFullYear() - 1) {
    lines.push(`- Copyright del sitio: ${f.copyrightYear} — el sitio aparenta estar desactualizado hace ${new Date().getFullYear() - f.copyrightYear} años`)
  }
  if (f.builder) lines.push(`- Construido con: ${f.builder}`)

  return lines.join('\n')
}

function clampScore(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : 5
}

function parseAuditResponse(raw: string, hasWebsite: boolean): AuditData {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude no devolvió JSON')

  const parsed = JSON.parse(match[0]) as {
    resumen?: string
    scores?: Record<string, unknown>
    hallazgos?: Partial<AuditFinding>[]
    whatsappMessage?: string
  }

  if (!parsed.resumen || !Array.isArray(parsed.hallazgos) || parsed.hallazgos.length === 0 || !parsed.whatsappMessage) {
    throw new Error('Respuesta de auditoría incompleta')
  }

  return {
    tipo:    hasWebsite ? 'auditoria' : 'oportunidad',
    resumen: String(parsed.resumen),
    scores: {
      presencia:  clampScore(parsed.scores?.presencia),
      seo:        clampScore(parsed.scores?.seo),
      mobile:     clampScore(parsed.scores?.mobile),
      conversion: clampScore(parsed.scores?.conversion),
    },
    hallazgos: parsed.hallazgos.slice(0, 5).map((h) => ({
      titulo:   String(h.titulo ?? ''),
      detalle:  String(h.detalle ?? ''),
      servicio: String(h.servicio ?? ''),
      precio:   String(h.precio ?? ''),
    })),
    whatsappMessage: String(parsed.whatsappMessage),
  }
}

export async function generateAudit(input: AuditInput): Promise<AuditData> {
  const text = await callClaude(AUDIT_SYSTEM, buildAuditPrompt(input), 1600)
  return parseAuditResponse(text, Boolean(input.website && input.facts?.reachable !== false))
}

// ─── Informe público HTML ────────────────────────────────────────────────
// El informe ES la demo: se sirve como página pública brandeada (B&N 2026,
// Clash Display + DM Sans, botón con gradiente 3D) que el prospecto abre
// desde WhatsApp/email sin autenticación.

const BRAND_ICON_SVG = `<svg width="28" height="28" viewBox="0 0 489 496" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M238.455 417.179C193.513 417.179 150.411 399.311 118.632 367.507C86.8532 335.703 69 292.567 69 247.589C69 202.611 86.8532 159.476 118.632 127.672C150.411 95.8674 193.513 78 238.455 78L238.455 417.179Z" fill="black"/><path d="M421 417.179C376.058 417.179 332.956 399.311 301.177 367.507C269.398 335.703 251.545 292.567 251.545 247.589C251.545 202.611 269.398 159.476 301.177 127.672C332.956 95.8674 376.058 78 421 78V417.179Z" fill="black"/></svg>`

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const SCORE_LABELS: Record<keyof AuditData['scores'], string> = {
  presencia:  'Presencia digital',
  seo:        'Visibilidad en Google',
  mobile:     'Experiencia en celular',
  conversion: 'Conversión a clientes',
}

// CTA del informe: link de WhatsApp del negocio (configurable) con fallback
// al email corporativo — nunca un número hardcodeado que no sea de la agencia.
const CTA_URL = process.env.AUDIT_CTA_URL ?? 'mailto:comunicacion@colonia.cloud'
const CTA_LABEL = CTA_URL.startsWith('mailto:') ? 'Escribinos' : 'Escribinos por WhatsApp'

export function renderAuditHtml(businessName: string, audit: Audit): string {
  const data = audit.data
  const date = new Date(audit.createdAt).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })
  const title = data.tipo === 'auditoria' ? 'Auditoría digital' : 'Informe de oportunidad digital'

  const scoresHtml = (Object.keys(SCORE_LABELS) as (keyof AuditData['scores'])[]).map((key) => {
    const value = data.scores[key]
    return `<div class="score">
      <div class="score-head"><span>${SCORE_LABELS[key]}</span><strong>${value}/10</strong></div>
      <div class="bar"><div class="bar-fill" style="width:${value * 10}%"></div></div>
    </div>`
  }).join('')

  const findingsHtml = data.hallazgos.map((h, i) => `
    <div class="finding">
      <div class="finding-num">${i + 1}</div>
      <div>
        <h3>${escapeHtml(h.titulo)}</h3>
        <p>${escapeHtml(h.detalle)}</p>
        <p class="finding-fix">Cómo lo resolvemos: <strong>${escapeHtml(h.servicio)}</strong> · ${escapeHtml(h.precio)}</p>
      </div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — ${escapeHtml(businessName)} | Colonia Cloud</title>
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #FFFAFA; color: #000; font-family: 'DM Sans', system-ui, sans-serif; line-height: 1.6; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 48px 24px 64px; }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 40px; }
  header span { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
  h1 { font-family: 'Clash Display', sans-serif; font-weight: 600; font-size: 34px; line-height: 1.15; margin-bottom: 6px; }
  .subtitle { color: #555; margin-bottom: 8px; }
  .date { font-size: 13px; color: #A3A3A3; margin-bottom: 36px; }
  .resumen { font-size: 17px; border-left: 3px solid #000; padding: 4px 0 4px 18px; margin-bottom: 40px; }
  h2 { font-family: 'Clash Display', sans-serif; font-weight: 500; font-size: 21px; margin-bottom: 18px; }
  .scores { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; margin-bottom: 44px; }
  @media (max-width: 520px) { .scores { grid-template-columns: 1fr; } }
  .score-head { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
  .score-head span { color: #555; }
  .bar { height: 6px; background: #EDEDED; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(to right, #000, #333); border-radius: 999px; }
  .finding { display: flex; gap: 16px; padding: 22px 0; border-top: 1px solid rgba(0,0,0,0.10); }
  .finding:last-of-type { border-bottom: 1px solid rgba(0,0,0,0.10); margin-bottom: 44px; }
  .finding-num { flex-shrink: 0; width: 30px; height: 30px; border-radius: 999px; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; }
  .finding h3 { font-family: 'Clash Display', sans-serif; font-weight: 500; font-size: 17px; margin-bottom: 4px; }
  .finding p { font-size: 15px; color: #555; }
  .finding-fix { margin-top: 8px; font-size: 14px !important; color: #000 !important; }
  .cta { background: #F2F2F2; border-radius: 16px; padding: 32px; text-align: center; }
  .cta h2 { margin-bottom: 8px; }
  .cta p { color: #555; margin-bottom: 20px; font-size: 15px; }
  .cta a { display: inline-block; padding: 12px 28px; color: #fff; text-decoration: none; font-weight: 500; font-size: 15px; border-radius: 8px;
    background: linear-gradient(to bottom, #000 0%, #000 65%, #0D0D0D 100%);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.15); }
  .cta a:hover { background: linear-gradient(to bottom, #262626 0%, #262626 65%, #1A1A1A 100%); }
  footer { margin-top: 40px; text-align: center; font-size: 12px; color: #A3A3A3; }
</style>
</head>
<body>
<div class="wrap">
  <header>${BRAND_ICON_SVG}<span>Colonia Cloud</span></header>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">Preparada para <strong>${escapeHtml(businessName)}</strong></p>
  <p class="date">${date} · Sin costo, sin compromiso</p>
  <p class="resumen">${escapeHtml(data.resumen)}</p>
  <h2>Puntaje por área</h2>
  <div class="scores">${scoresHtml}</div>
  <h2>${data.tipo === 'auditoria' ? 'Qué encontramos' : 'Qué oportunidades vimos'}</h2>
  ${findingsHtml}
  <div class="cta">
    <h2>¿Lo charlamos?</h2>
    <p>Somos de Colonia y trabajamos con negocios como el tuyo. La primera consulta es gratis.</p>
    <a href="${CTA_URL}">${CTA_LABEL}</a>
  </div>
  <footer>Colonia Cloud — Llevamos tu negocio a la nube · colonia.cloud<br>Informe generado con análisis técnico real de tu presencia online.</footer>
</div>
</body>
</html>`
}
