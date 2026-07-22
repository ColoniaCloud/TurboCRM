import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'
import { deals } from './deals'
import { user } from './auth'

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
  assignedTo: text('assigned_to').references(() => user.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date'),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Task = typeof tasks.$inferSelect
export type TaskInsert = typeof tasks.$inferInsert
