'use client'

import { useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import type { CustomFieldType } from '@colonia-crm/shared'
import { useApp } from '../../app-context'

const MAX_ROWS = 500

const CRM_FIELDS = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Teléfono', required: false },
  { key: 'companyName', label: 'Empresa', required: false },
  { key: 'status', label: 'Estado (Lead, Prospecto, Cliente o Inactivo)', required: false },
  { key: 'tagNames', label: 'Etiquetas (separadas por coma)', required: false },
] as const

type FieldDefinition = {
  id: string
  key: string
  label: string
  fieldType: CustomFieldType
}

type ImportResult = {
  created: number
  updated: number
  skipped: { row: number; error: string }[]
}

export default function ContactsImportPage() {
  const { apiFetch } = useApp()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [parseError, setParseError] = useState<string | null>(null)

  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')

  const [customFieldDefs, setCustomFieldDefs] = useState<FieldDefinition[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function loadCustomFieldDefs() {
    if (customFieldDefs) return
    const res  = await apiFetch('/api/custom-fields?entityType=contact')
    const data = await res.json() as { items: FieldDefinition[] }
    setCustomFieldDefs(data.items)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParseError(null)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data
        if (data.length === 0) {
          setParseError('El archivo no tiene filas para importar')
          return
        }
        if (data.length > MAX_ROWS) {
          setParseError(
            `El archivo tiene ${data.length} filas, el máximo por importación es ${MAX_ROWS} — dividilo en partes más chicas.`,
          )
          return
        }
        setColumns(results.meta.fields ?? [])
        setRows(data)
        setFileName(file.name)
        loadCustomFieldDefs().catch(() => setParseError('No se pudieron cargar los campos personalizados'))
        setStep(2)
      },
      error: () => setParseError('No se pudo leer el archivo CSV'),
    })
  }

  function setMap(key: string, column: string) {
    setMapping((prev) => ({ ...prev, [key]: column }))
  }

  function buildPayload() {
    const get = (row: Record<string, string>, key: string) => {
      const col = mapping[key]
      return col ? row[col]?.trim() || undefined : undefined
    }

    return rows.map((row) => {
      const tagsCol   = mapping.tagNames
      const tagsCell  = tagsCol ? row[tagsCol] : undefined
      const tagNames  = tagsCell
        ? tagsCell.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : undefined

      const customFields: Record<string, string> = {}
      for (const def of customFieldDefs ?? []) {
        const col = mapping[`cf:${def.key}`]
        const value = col ? row[col]?.trim() : undefined
        if (value) customFields[def.key] = value
      }

      return {
        name:         get(row, 'name'),
        email:        get(row, 'email'),
        phone:        get(row, 'phone'),
        companyName:  get(row, 'companyName'),
        status:       get(row, 'status'),
        tagNames,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      }
    })
  }

  async function handleImport() {
    setImporting(true)
    setImportError(null)
    try {
      const res = await apiFetch('/api/contacts/import', {
        method: 'POST',
        body: JSON.stringify({ rows: buildPayload() }),
      })
      const data = await res.json().catch(() => null) as (ImportResult & { error?: string }) | null
      if (!res.ok) {
        throw new Error(data?.error ?? 'No se pudo importar el archivo')
      }
      setResult(data)
      setStep(4)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo importar el archivo')
    } finally {
      setImporting(false)
    }
  }

  const nameMapped = Boolean(mapping.name)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/app/contacts" className="back-link">← Contactos</Link>
          <h1>Importar CSV</h1>
          <p>Paso {step} de 4</p>
        </div>
      </div>

      <div className="panel">
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Subí un archivo CSV con encabezados en la primera fila. Máximo {MAX_ROWS} filas por importación.
            </p>
            <input type="file" accept=".csv" onChange={handleFile} />
            {parseError && <div className="form-error">{parseError}</div>}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {fileName} — {rows.length} filas detectadas. Elegí qué columna del CSV corresponde a cada campo.
            </p>

            <div className="detail-form-grid">
              {CRM_FIELDS.map((field) => (
                <div key={field.key} className="inline-field">
                  <label htmlFor={`map-${field.key}`}>{field.label}{field.required ? ' *' : ''}</label>
                  <select
                    id={`map-${field.key}`}
                    value={mapping[field.key] ?? ''}
                    onChange={(e) => setMap(field.key, e.target.value)}
                  >
                    <option value="">No importar</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}

              {(customFieldDefs ?? []).map((def) => (
                <div key={def.id} className="inline-field">
                  <label htmlFor={`map-cf-${def.key}`}>{def.label}</label>
                  <select
                    id={`map-cf-${def.key}`}
                    value={mapping[`cf:${def.key}`] ?? ''}
                    onChange={(e) => setMap(`cf:${def.key}`, e.target.value)}
                  >
                    <option value="">No importar</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
              <button className="btn-ghost" onClick={() => setStep(1)}>Atrás</button>
              <button className="btn" disabled={!nameMapped} onClick={() => setStep(3)}>Continuar</button>
            </div>
            {!nameMapped && (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                Tenés que mapear la columna de Nombre para continuar.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            <p>Se van a procesar <strong>{rows.length}</strong> filas de <strong>{fileName}</strong>.</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Si el email de una fila coincide con un contacto existente, se actualiza en vez de duplicarlo.
            </p>
            {importError && <div className="form-error">{importError}</div>}
            <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
              <button className="btn-ghost" onClick={() => setStep(2)} disabled={importing}>Atrás</button>
              <button className="btn" onClick={handleImport} disabled={importing}>
                {importing ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            <p>
              <strong>{result.created}</strong> contacto{result.created === 1 ? '' : 's'} creado{result.created === 1 ? '' : 's'},{' '}
              <strong>{result.updated}</strong> actualizado{result.updated === 1 ? '' : 's'}.
            </p>

            {result.skipped.length > 0 && (
              <div>
                <p style={{ fontWeight: 600 }}>
                  {result.skipped.length} fila{result.skipped.length === 1 ? '' : 's'} no se importó{result.skipped.length === 1 ? '' : 'ron'}:
                </p>
                <ul style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  {result.skipped.map((s, i) => (
                    <li key={i}>Fila {s.row}: {s.error}</li>
                  ))}
                </ul>
              </div>
            )}

            <Link href="/app/contacts" className="btn" style={{ alignSelf: 'flex-start' }}>
              Volver a Contactos
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
