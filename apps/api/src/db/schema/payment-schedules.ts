import { pgTable, text, timestamp, uuid, numeric, integer } from 'drizzle-orm/pg-core'
import { contacts } from './contacts'
import type { DealCurrency, PaymentStatus, PaymentRecurrence } from '@colonia-crm/shared'

export const paymentSchedules = pgTable('payment_schedules', {
  id:          uuid('id').primaryKey().defaultRandom(),
  contactId:   uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amount:      numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency:    text('currency').notNull().default('USD').$type<DealCurrency>(),
  dueDate:     timestamp('due_date').notNull(),
  status:      text('status').notNull().default('pending').$type<PaymentStatus>(),
  recurrence:  text('recurrence').notNull().default('none').$type<PaymentRecurrence>(),

  // Días antes del vencimiento en que se manda el recordatorio automático.
  reminderDaysBefore: integer('reminder_days_before').notNull().default(3),
  // Fecha del último recordatorio enviado — se compara por día calendario
  // (no por timestamp exacto) para no reenviar más de una vez por día,
  // sin importar cuántas veces corra el chequeo periódico.
  lastReminderSentAt: timestamp('last_reminder_sent_at'),

  paidAt:    timestamp('paid_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type PaymentSchedule = typeof paymentSchedules.$inferSelect
export type PaymentScheduleInsert = typeof paymentSchedules.$inferInsert
