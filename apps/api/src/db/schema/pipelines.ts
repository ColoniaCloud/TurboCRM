import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core'

export const pipelines = pgTable('pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  pipelineId: uuid('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#7170C0'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type Pipeline = typeof pipelines.$inferSelect
export type PipelineInsert = typeof pipelines.$inferInsert
export type PipelineStage = typeof pipelineStages.$inferSelect
export type PipelineStageInsert = typeof pipelineStages.$inferInsert
