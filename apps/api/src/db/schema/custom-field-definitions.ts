import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, unique } from 'drizzle-orm/pg-core'
import type { CustomFieldType, CustomFieldEntityType } from '@colonia-crm/shared'

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull().$type<CustomFieldEntityType>(),
  key:        text('key').notNull(),
  label:      text('label').notNull(),
  fieldType:  text('field_type').notNull().$type<CustomFieldType>(),
  options:    jsonb('options').$type<string[]>(),
  required:   boolean('required').notNull().default(false),
  position:   integer('position').notNull().default(0),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  entityKeyUnique: unique().on(table.entityType, table.key),
}))

export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect
export type CustomFieldDefinitionInsert = typeof customFieldDefinitions.$inferInsert
