import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform'),
  url: text('url'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Project = typeof projects.$inferSelect
export type ProjectInsert = typeof projects.$inferInsert
