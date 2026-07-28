import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform'),
  url: text('url'),
  notes: text('notes'),
  // Referencias de cuentas digitales (ej. { "Google Analytics": "cliente@gmail.com" }) —
  // NUNCA contraseñas, solo etiquetas/identificadores para saber qué cuenta se usó.
  accounts: jsonb('accounts').$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Project = typeof projects.$inferSelect
export type ProjectInsert = typeof projects.$inferInsert
