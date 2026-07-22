import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import type { ContactStatus } from '@colonia-crm/shared'

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  companyName: text('company_name'),
  status: text('status').notNull().default('lead').$type<ContactStatus>(),
  notes: text('notes'),
  customFields: jsonb('custom_fields').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Contact = typeof contacts.$inferSelect
export type ContactInsert = typeof contacts.$inferInsert
