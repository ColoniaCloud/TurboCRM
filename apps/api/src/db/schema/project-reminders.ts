import { pgTable, text, timestamp, uuid, numeric, integer } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { tasks } from './tasks'
import type { ProjectReminderKind, ProjectReminderRecurrence } from '@colonia-crm/shared'

export const projectReminders = pgTable('project_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().$type<ProjectReminderKind>(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  currency: text('currency').default('USD'),
  dueDate: timestamp('due_date').notNull(),
  recurrence: text('recurrence').notNull().default('none').$type<ProjectReminderRecurrence>(),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(7),
  // Tarea auto-creada para este vencimiento — null hasta que dispara. Al
  // marcarse "done" esa tarea, si recurrence != 'none' se recalcula dueDate
  // hacia adelante y esto vuelve a null (listo para el próximo ciclo).
  taskCreatedId: uuid('task_created_id').references(() => tasks.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type ProjectReminder = typeof projectReminders.$inferSelect
export type ProjectReminderInsert = typeof projectReminders.$inferInsert
