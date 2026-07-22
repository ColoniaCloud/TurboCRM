import { pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core'

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameUnique: unique().on(table.name),
}))

export type Tag = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert
