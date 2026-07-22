import type { ContactStatus } from '@colonia-crm/shared'

const STATUS_ALIASES: Record<string, ContactStatus> = {
  lead: 'lead',
  prospect: 'prospect',
  prospecto: 'prospect',
  client: 'client',
  cliente: 'client',
  inactive: 'inactive',
  inactivo: 'inactive',
}

/**
 * Reconoce el status de una celda de CSV contra las keys canónicas y sus
 * labels en español, sin importar mayúsculas. Si no reconoce el valor
 * devuelve undefined — la fila no fuerza un status (al crear cae al
 * default 'lead', al actualizar no toca el status existente).
 */
export function matchStatus(raw: string | undefined | null): ContactStatus | undefined {
  if (!raw) return undefined
  return STATUS_ALIASES[raw.trim().toLowerCase()]
}

export type ImportRowInput = {
  name?: string
  email?: string
  phone?: string
  companyName?: string
  status?: string
  customFields?: Record<string, unknown>
  tagNames?: string[]
}

export type IndexedImportRow = ImportRowInput & { row: number }

export type ImportRowError = { row: number; error: string }

/**
 * Agrupa las filas por email (case-insensitive) y se queda con la primera
 * de cada grupo — necesario porque el chequeo de duplicados contra la DB
 * no alcanza a filas duplicadas entre sí dentro del mismo archivo (dos
 * filas nuevas con el mismo email terminarían creando dos contactos).
 */
export function dedupeImportRows(rows: ImportRowInput[]): { rows: IndexedImportRow[]; skipped: ImportRowError[] } {
  const firstRowByEmail = new Map<string, number>()
  const kept: IndexedImportRow[] = []
  const skipped: ImportRowError[] = []

  rows.forEach((row, i) => {
    const rowNumber = i + 1
    const email = row.email?.trim().toLowerCase()

    if (email) {
      const firstRow = firstRowByEmail.get(email)
      if (firstRow !== undefined) {
        skipped.push({ row: rowNumber, error: `email duplicado dentro del archivo (se usó la fila ${firstRow})` })
        return
      }
      firstRowByEmail.set(email, rowNumber)
    }

    kept.push({ ...row, row: rowNumber })
  })

  return { rows: kept, skipped }
}
