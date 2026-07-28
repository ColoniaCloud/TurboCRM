import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const projectEnvVars = pgTable('project_env_vars', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ProjectEnvVar = typeof projectEnvVars.$inferSelect
export type ProjectEnvVarInsert = typeof projectEnvVars.$inferInsert
