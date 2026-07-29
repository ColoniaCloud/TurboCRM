'use client'

import { useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import type { CustomFieldType } from '@colonia-crm/shared'
import { useApp } from '../../app-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

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

const NO_IMPORT = '__no_import__'

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
    setMapping((prev) => ({ ...prev, [key]: column === NO_IMPORT ? '' : column }))
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

  function ColumnSelect({ id, value, onChange }: { id: string; value: string; onChange: (col: string) => void }) {
    return (
      <Select value={value || NO_IMPORT} onValueChange={(v) => onChange(v ?? NO_IMPORT)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(v: string) => v === NO_IMPORT || !v ? 'No importar' : v}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_IMPORT}>No importar</SelectItem>
          {columns.map((col) => (
            <SelectItem key={col} value={col}>{col}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link href="/app/contacts" className="text-sm text-muted-foreground hover:underline">← Contactos</Link>
        <h1 className="text-xl font-semibold">Importar CSV</h1>
        <p className="text-sm text-muted-foreground">Paso {step} de 4</p>
      </div>

      <Card>
        <CardContent>
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Subí un archivo CSV con encabezados en la primera fila. Máximo {MAX_ROWS} filas por importación.
              </p>
              <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
              {parseError && (
                <Alert variant="destructive"><AlertDescription>{parseError}</AlertDescription></Alert>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {fileName} — {rows.length} filas detectadas. Elegí qué columna del CSV corresponde a cada campo.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CRM_FIELDS.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`map-${field.key}`}>{field.label}{field.required ? ' *' : ''}</Label>
                    <ColumnSelect
                      id={`map-${field.key}`}
                      value={mapping[field.key] ?? ''}
                      onChange={(col) => setMap(field.key, col)}
                    />
                  </div>
                ))}

                {(customFieldDefs ?? []).map((def) => (
                  <div key={def.id} className="flex flex-col gap-1.5">
                    <Label htmlFor={`map-cf-${def.key}`}>{def.label}</Label>
                    <ColumnSelect
                      id={`map-cf-${def.key}`}
                      value={mapping[`cf:${def.key}`] ?? ''}
                      onChange={(col) => setMap(`cf:${def.key}`, col)}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
                <Button disabled={!nameMapped} onClick={() => setStep(3)}>Continuar</Button>
              </div>
              {!nameMapped && (
                <p className="text-sm text-muted-foreground">
                  Tenés que mapear la columna de Nombre para continuar.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm">Se van a procesar <strong>{rows.length}</strong> filas de <strong>{fileName}</strong>.</p>
              <p className="text-sm text-muted-foreground">
                Si el email de una fila coincide con un contacto existente, se actualiza en vez de duplicarlo.
              </p>
              {importError && (
                <Alert variant="destructive"><AlertDescription>{importError}</AlertDescription></Alert>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} disabled={importing}>Atrás</Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? 'Importando…' : 'Importar'}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && result && (
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                <strong>{result.created}</strong> contacto{result.created === 1 ? '' : 's'} creado{result.created === 1 ? '' : 's'},{' '}
                <strong>{result.updated}</strong> actualizado{result.updated === 1 ? '' : 's'}.
              </p>

              {result.skipped.length > 0 && (
                <div>
                  <p className="text-sm font-semibold">
                    {result.skipped.length} fila{result.skipped.length === 1 ? '' : 's'} no se importó{result.skipped.length === 1 ? '' : 'ron'}:
                  </p>
                  <ul className="text-sm text-muted-foreground">
                    {result.skipped.map((s, i) => (
                      <li key={i}>Fila {s.row}: {s.error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button className="self-start" nativeButton={false} render={<Link href="/app/contacts">Volver a Contactos</Link>} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
