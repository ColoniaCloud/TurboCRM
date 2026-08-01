export type UserRole = 'admin' | 'member'

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  status: 'ok' | 'error'
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ContactStatus = 'lead' | 'prospect' | 'client' | 'inactive'

export type DealCurrency = 'USD' | 'UYU' | 'ARS' | 'CLP' | 'BRL'

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select'

export type CustomFieldEntityType = 'contact'

export type PaymentStatus     = 'pending' | 'paid' | 'overdue' | 'cancelled'
export type PaymentRecurrence = 'none' | 'monthly' | 'annual'

// Vencimientos de un proyecto (hosting/dominio/mantenimiento) — recurrencia
// propia, más granular que PaymentRecurrence (soporta "cada 3 meses" para
// mantenimiento de plugins/paquetes) y sin acoplarse a los cobros a clientes.
export type ProjectReminderKind       = 'hosting' | 'domain' | 'maintenance' | 'other'
export type ProjectReminderRecurrence = 'none' | 'monthly' | 'quarterly' | 'biannual' | 'annual'

// Búsqueda geográfica de prospección (scraping) — límites de
// `locationRestriction.circle` de Places API (New): tope real de Google es
// 50000m. Constantes compartidas para que el clamp del front y el del
// back no se desincronicen.
export const SCRAPING_MIN_RADIUS_METERS     = 500
export const SCRAPING_MAX_RADIUS_METERS     = 50_000
export const SCRAPING_DEFAULT_RADIUS_METERS = 5_000

// Colonia del Sacramento, Uruguay — sede de la agencia, centro por default
// del mapa de prospección cuando todavía no se completó ninguna ubicación.
export const SCRAPING_DEFAULT_CENTER = { lat: -34.4623, lng: -57.8400 }

// Timeline unificado del contacto. Los primeros 4 valores son los que esta
// fase implementa; el resto queda declarado como preparación para fases
// futuras (integración de WhatsApp, email, cobros y scraping/enriquecimiento).
export type ActivityType =
  | 'note'
  | 'status_change'
  | 'created'
  | 'updated'
  | 'whatsapp_message'
  | 'email'
  | 'payment_due'
  | 'payment_received'
  | 'scrape_enriched'
  | 'audit_generated'
  | 'project_created'
  | 'project_reminder_due'
