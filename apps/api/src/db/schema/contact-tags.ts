import { pgTable, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'
import { tags } from './tags'

export const contactTags = pgTable('contact_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  contactTagUnique: unique().on(table.contactId, table.tagId),
}))

export type ContactTag = typeof contactTags.$inferSelect
export type ContactTagInsert = typeof contactTags.$inferInsert
