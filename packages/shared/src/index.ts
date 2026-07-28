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
