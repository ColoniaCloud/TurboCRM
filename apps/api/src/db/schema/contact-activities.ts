import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'
import { user } from './auth'
import type { ActivityType } from '@colonia-crm/shared'

export const contactActivities = pgTable('contact_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  // Texto libre (no enum TS cerrado) — fases futuras suman tipos nuevos
  // (whatsapp_message, email, payment_due, payment_received, scrape_enriched)
  // sin requerir una migración de schema, solo el string literal union en shared.
  type: text('type').notNull().$type<ActivityType>(),
  content: text('content'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ContactActivity = typeof contactActivities.$inferSelect
export type ContactActivityInsert = typeof contactActivities.$inferInsert
