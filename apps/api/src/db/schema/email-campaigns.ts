import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'

export const emailCampaigns = pgTable('email_campaigns', {
  id:             uuid('id').primaryKey().defaultRandom(),
  subject:        text('subject').notNull(),
  body:           text('body').notNull(),
  recipientCount: integer('recipient_count').notNull().default(0),
  failedCount:    integer('failed_count').notNull().default(0),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
})

export type EmailCampaign = typeof emailCampaigns.$inferSelect
export type EmailCampaignInsert = typeof emailCampaigns.$inferInsert
