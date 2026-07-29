import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

// Referencias de cuentas digitales (ej. label "Google Analytics", value
// "cliente@gmail.com") — NUNCA contraseñas, solo etiquetas/identificadores
// para saber qué cuenta se usó. Tabla propia (no jsonb) para poder colgarle
// archivos adjuntos por cuenta vía project_account_files.
export const projectAccounts = pgTable('project_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ProjectAccount = typeof projectAccounts.$inferSelect
export type ProjectAccountInsert = typeof projectAccounts.$inferInsert
