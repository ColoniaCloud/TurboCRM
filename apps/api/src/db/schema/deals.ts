import { pgTable, text, timestamp, uuid, numeric } from 'drizzle-orm/pg-core'
import { pipelines, pipelineStages } from './pipelines'
import { contacts } from './contacts'
import { user } from './auth'
import type { DealCurrency } from '@colonia-crm/shared'

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id),
  stageId: uuid('stage_id').notNull().references(() => pipelineStages.id),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  assignedTo: text('assigned_to').references(() => user.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  value: numeric('value', { precision: 12, scale: 2 }).default('0'),
  currency: text('currency').notNull().default('USD').$type<DealCurrency>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Deal = typeof deals.$inferSelect
export type DealInsert = typeof deals.$inferInsert
