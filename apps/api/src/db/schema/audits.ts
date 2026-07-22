import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'

export type AuditFinding = {
  titulo:   string
  detalle:  string
  servicio: string
  precio:   string
}

export type AuditData = {
  tipo:    'auditoria' | 'oportunidad' // con sitio web / sin sitio web
  resumen: string
  scores:  { presencia: number; seo: number; mobile: number; conversion: number }
  hallazgos: AuditFinding[]
  whatsappMessage: string
}

export const audits = pgTable('audits', {
  id:        uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  // Token no adivinable para la URL pública del informe — el prospecto lo
  // abre sin autenticación, así que no puede ser un id secuencial.
  publicId:  text('public_id').notNull().unique(),
  data:      jsonb('data').$type<AuditData>().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type Audit = typeof audits.$inferSelect
export type AuditInsert = typeof audits.$inferInsert
