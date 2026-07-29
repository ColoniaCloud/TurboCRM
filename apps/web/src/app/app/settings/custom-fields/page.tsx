'use client'

import { useEffect, useState } from 'react'
import type { CustomFieldType } from '@colonia-crm/shared'
import { useApp } from '../../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type FieldDefinition = {
  id: string
  key: string
  label: string
  fieldType: CustomFieldType
  options: string[] | null
  required: boolean
}

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text:    'Texto',
  number:  'Número',
  date:    'Fecha',
  boolean: 'Sí/No',
  select:  'Lista de opciones',
}

// Quita marcas diacríticas (acentos) tras normalizar a NFD.
const DIACRITICS_RE = /\p{Diacritic}/gu

function slugify(label: string): string {
  const slug = label
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_+|_+$)/g, '')
    .slice(0, 40)

  return slug || 'campo'
}

export default function CustomFieldsSettingsPage() {
  const { apiFetch, me } = useApp()

  const [definitions, setDefinitions] = useState<FieldDefinition[] | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [submitting, setSubmitting]   = useState(false)

  const [label, setLabel]             = useState('')
  const [fieldType, setFieldType]     = useState<CustomFieldType>('text')
  const [required, setRequired]       = useState(false)
  const [optionsInput, setOptionsInput] = useState('')

  async function load() {
    const res  = await apiFetch('/api/custom-fields?entityType=contact')
    const data = await res.json() as { items: FieldDefinition[] }
    setDefinitions(data.items)
  }

  useEffect(() => {
    load().catch(() => setError('No se pudieron cargar los campos'))
  }, [apiFetch])

  const isAdmin = me.user.role === 'admin'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const trimmedLabel = label.trim()
    if (!trimmedLabel) return

    const options = fieldType === 'select'
      ? optionsInput.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined

    if (fieldType === 'select' && (!options || options.length === 0)) {
      setError('Agregá al menos una opción, separadas por coma')
      return
    }

    setSubmitting(true)

    try {
      const res = await apiFetch('/api/custom-fields', {
        method: 'POST',
        body: JSON.stringify({
          key:   slugify(trimmedLabel),
          label: trimmedLabel,
          fieldType,
          required,
          options,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el campo')
      }

      setLabel('')
      setRequired(false)
      setOptionsInput('')
      setFieldType('text')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el campo')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/custom-fields/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Definí campos propios para la ficha de contacto — vencimientos, talles, lo que tu negocio necesite.
      </p>

      {!isAdmin && (
        <p className="text-sm text-muted-foreground">Solo un admin puede gestionar los campos personalizados.</p>
      )}

      {isAdmin && (
        <Card>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-1 min-w-48 flex-col gap-1.5">
                <Label htmlFor="field-label">Nombre del campo</Label>
                <Input
                  id="field-label" required
                  value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder="Vencimiento de membresía"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-type">Tipo</Label>
                <Select value={fieldType} onValueChange={(v) => v && setFieldType(v as CustomFieldType)}>
                  <SelectTrigger id="field-type" className="w-40">
                    <SelectValue>{(v: string) => FIELD_TYPE_LABELS[v as CustomFieldType] ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([value, l]) => (
                      <SelectItem key={value} value={value}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fieldType === 'select' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="field-options">Opciones (separadas por coma)</Label>
                  <Input
                    id="field-options"
                    value={optionsInput} onChange={(e) => setOptionsInput(e.target.value)}
                    placeholder="S, M, L, XL"
                  />
                </div>
              )}
              <div className="flex items-center gap-2 pb-2">
                <Checkbox id="field-required" checked={required} onCheckedChange={(checked) => setRequired(checked === true)} />
                <Label htmlFor="field-required" className="text-sm font-normal text-muted-foreground">
                  Requerido
                </Label>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creando…' : 'Crear campo'}
              </Button>
            </form>

            {error && (
              <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          {!definitions ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : definitions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Todavía no definiste campos personalizados.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Opciones</TableHead>
                    <TableHead>Requerido</TableHead>
                    {isAdmin && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {definitions.map((def) => (
                    <TableRow key={def.id}>
                      <TableCell>{def.label}</TableCell>
                      <TableCell>{FIELD_TYPE_LABELS[def.fieldType]}</TableCell>
                      <TableCell>{def.options?.join(', ') ?? '—'}</TableCell>
                      <TableCell>{def.required ? 'Sí' : 'No'}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost" size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(def.id)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
