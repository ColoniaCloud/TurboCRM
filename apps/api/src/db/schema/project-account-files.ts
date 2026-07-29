import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { projectAccounts } from './project-accounts'

// Archivos opcionales adjuntos a una cuenta digital (texto plano o PDF —
// ver validación de extensión en routes/projects.ts). Contenido guardado
// en base64 directo en Postgres: el volumen esperado es bajo (notas,
// comprobantes puntuales) y evita depender de un bucket de storage aparte.
export const projectAccountFiles = pgTable('project_account_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => projectAccounts.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  fileData: text('file_data').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ProjectAccountFile = typeof projectAccountFiles.$inferSelect
export type ProjectAccountFileInsert = typeof projectAccountFiles.$inferInsert
