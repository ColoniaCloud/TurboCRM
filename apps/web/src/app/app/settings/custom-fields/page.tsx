'use client'

import { useEffect, useState } from 'react'
import type { CustomFieldType } from '@colonia-crm/shared'
import { useApp } from '../../app-context'

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

function slugify(label: string): string {
  const slug = label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p>Campos personalizados para la ficha de contacto.</p>
        </div>
      </div>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
        Definí campos propios para la ficha de contacto — vencimientos, talles, lo que tu negocio necesite.
      </p>

      {!isAdmin && (
        <p className="empty-state">Solo un admin puede gestionar los campos personalizados.</p>
      )}

      {isAdmin && (
        <div className="panel">
          <form className="inline-form" onSubmit={handleSubmit}>
            <div className="inline-field">
              <label htmlFor="field-label">Nombre del campo</label>
              <input
                id="field-label" required
                value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Vencimiento de membresía"
              />
            </div>
            <div className="inline-field" style={{ flex: '0 0 160px' }}>
              <label htmlFor="field-type">Tipo</label>
              <select id="field-type" value={fieldType} onChange={(e) => setFieldType(e.target.value as CustomFieldType)}>
                {Object.entries(FIELD_TYPE_LABELS).map(([value, l]) => (
                  <option key={value} value={value}>{l}</option>
                ))}
              </select>
            </div>
            {fieldType === 'select' && (
              <div className="inline-field">
                <label htmlFor="field-options">Opciones (separadas por coma)</label>
                <input
                  id="field-options"
                  value={optionsInput} onChange={(e) => setOptionsInput(e.target.value)}
                  placeholder="S, M, L, XL"
                />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', paddingBottom: 'var(--spacing-3)' }}>
              <input
                id="field-required" type="checkbox"
                checked={required} onChange={(e) => setRequired(e.target.checked)}
              />
              <label htmlFor="field-required" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Requerido
              </label>
            </div>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Creando…' : 'Crear campo'}
            </button>
          </form>

          {error && (
            <div className="form-error" style={{ marginTop: 'var(--spacing-4)' }}>{error}</div>
          )}
        </div>
      )}

      <div className="panel">
        {!definitions ? (
          <p className="empty-state">Cargando…</p>
        ) : definitions.length === 0 ? (
          <p className="empty-state">Todavía no definiste campos personalizados.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Opciones</th>
                  <th>Requerido</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {definitions.map((def) => (
                  <tr key={def.id}>
                    <td>{def.label}</td>
                    <td>{FIELD_TYPE_LABELS[def.fieldType]}</td>
                    <td>{def.options?.join(', ') ?? '—'}</td>
                    <td>{def.required ? 'Sí' : 'No'}</td>
                    {isAdmin && (
                      <td>
                        <button className="link-danger" onClick={() => handleDelete(def.id)}>Eliminar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
