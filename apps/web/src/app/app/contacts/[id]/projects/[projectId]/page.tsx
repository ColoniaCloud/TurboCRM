'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProjectReminderKind, ProjectReminderRecurrence } from '@colonia-crm/shared'
import { useApp } from '../../../../app-context'

type Project = {
  id: string
  contactId: string
  name: string
  platform: string | null
  url: string | null
  notes: string | null
  accounts: Record<string, string>
}

type ReminderItem = {
  id: string
  kind: ProjectReminderKind
  description: string
  amount: string | null
  currency: string | null
  dueDate: string
  recurrence: ProjectReminderRecurrence
  reminderDaysBefore: number
  taskCreatedId: string | null
}

type EnvVarItem = {
  id: string
  name: string
  value: string
  createdAt: string
}

const KIND_LABELS: Record<ProjectReminderKind, string> = {
  hosting: 'Hosting',
  domain: 'Dominio',
  maintenance: 'Mantenimiento',
  other: 'Otro',
}

const RECURRENCE_LABELS: Record<ProjectReminderRecurrence, string> = {
  none: '—',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  biannual: 'Semestral',
  annual: 'Anual',
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatAmount(amount: string | null, currency: string | null): string {
  if (!amount) return '—'
  const num = Number(amount)
  return `${currency ?? 'USD'} ${Number.isFinite(num) ? num.toLocaleString('es-UY') : amount}`
}

export default function ProjectDetailPage() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>()
  const router = useRouter()
  const { apiFetch } = useApp()

  const [project, setProject]   = useState<Project | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [name, setName]         = useState('')
  const [platform, setPlatform] = useState('')
  const [url, setUrl]           = useState('')
  const [notes, setNotes]       = useState('')

  const [accountsError, setAccountsError]     = useState<string | null>(null)
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [newAccountValue, setNewAccountValue] = useState('')
  const [savingAccount, setSavingAccount]     = useState(false)

  const [reminders, setReminders]           = useState<ReminderItem[] | null>(null)
  const [remindersError, setRemindersError] = useState<string | null>(null)
  const [creatingReminder, setCreatingReminder] = useState(false)
  const [reminderKind, setReminderKind]         = useState<ProjectReminderKind>('hosting')
  const [reminderDescription, setReminderDescription] = useState('')
  const [reminderDueDate, setReminderDueDate]   = useState('')
  const [reminderAmount, setReminderAmount]     = useState('')
  const [reminderCurrency, setReminderCurrency] = useState('USD')
  const [reminderRecurrence, setReminderRecurrence] = useState<ProjectReminderRecurrence>('none')
  const [reminderDaysBefore, setReminderDaysBefore] = useState('7')

  const [envVars, setEnvVars]                 = useState<EnvVarItem[] | null>(null)
  const [envVarsError, setEnvVarsError]       = useState<string | null>(null)
  const [creatingEnvVar, setCreatingEnvVar]   = useState(false)
  const [newEnvVarName, setNewEnvVarName]     = useState('')
  const [newEnvVarValue, setNewEnvVarValue]   = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await apiFetch(`/api/projects/${projectId}`)

      if (res.status === 404) {
        if (!cancelled) setNotFound(true)
        return
      }
      if (!res.ok) {
        throw new Error('No se pudo cargar el proyecto')
      }

      const data = await res.json() as { item: Project }

      if (!cancelled) {
        setProject(data.item)
        setName(data.item.name)
        setPlatform(data.item.platform ?? '')
        setUrl(data.item.url ?? '')
        setNotes(data.item.notes ?? '')
      }
    }

    load().catch(() => { if (!cancelled) setError('No se pudo cargar el proyecto') })

    return () => { cancelled = true }
  }, [apiFetch, projectId])

  async function loadReminders() {
    const res = await apiFetch(`/api/projects/${projectId}/reminders`)
    const data = await res.json() as { items: ReminderItem[] }
    setReminders(data.items)
  }

  useEffect(() => {
    let cancelled = false

    loadReminders().catch(() => { if (!cancelled) setRemindersError('No se pudieron cargar los vencimientos') })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId])

  async function loadEnvVars() {
    const res = await apiFetch(`/api/projects/${projectId}/env-vars`)
    const data = await res.json() as { items: EnvVarItem[] }
    setEnvVars(data.items)
  }

  useEffect(() => {
    let cancelled = false

    loadEnvVars().catch(() => { if (!cancelled) setEnvVarsError('No se pudieron cargar las variables de entorno') })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, projectId])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          platform: platform || null,
          url: url || null,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo guardar el proyecto')
      }

      const data = await res.json() as { item: Project }
      setProject(data.item)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el proyecto')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const label = newAccountLabel.trim()
    const value = newAccountValue.trim()
    if (!label || !value) return

    setSavingAccount(true)
    setAccountsError(null)

    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accounts: { [label]: value } }),
      })
      if (!res.ok) {
        throw new Error('No se pudo guardar la cuenta')
      }
      const data = await res.json() as { item: Project }
      setProject(data.item)
      setNewAccountLabel('')
      setNewAccountValue('')
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta')
    } finally {
      setSavingAccount(false)
    }
  }

  async function handleRemoveAccount(label: string) {
    setAccountsError(null)
    try {
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accounts: { [label]: '' } }),
      })
      if (!res.ok) {
        throw new Error('No se pudo quitar la cuenta')
      }
      const data = await res.json() as { item: Project }
      setProject(data.item)
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'No se pudo quitar la cuenta')
    }
  }

  async function handleCreateReminder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const description = reminderDescription.trim()
    if (!description || !reminderDueDate) return

    setCreatingReminder(true)
    setRemindersError(null)

    try {
      const res = await apiFetch(`/api/projects/${projectId}/reminders`, {
        method: 'POST',
        body: JSON.stringify({
          kind: reminderKind,
          description,
          dueDate: new Date(reminderDueDate).toISOString(),
          amount: reminderAmount ? Number(reminderAmount) : undefined,
          currency: reminderCurrency,
          recurrence: reminderRecurrence,
          reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el vencimiento')
      }

      setReminderDescription('')
      setReminderDueDate('')
      setReminderAmount('')
      setReminderRecurrence('none')
      setReminderDaysBefore('7')
      await loadReminders()
    } catch (err) {
      setRemindersError(err instanceof Error ? err.message : 'No se pudo crear el vencimiento')
    } finally {
      setCreatingReminder(false)
    }
  }

  async function handleDeleteReminder(reminderId: string) {
    await apiFetch(`/api/projects/${projectId}/reminders/${reminderId}`, { method: 'DELETE' })
    await loadReminders()
  }

  async function handleCreateEnvVar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newEnvVarName.trim()
    const value = newEnvVarValue.trim()
    if (!name || !value) return

    setCreatingEnvVar(true)
    setEnvVarsError(null)

    try {
      const res = await apiFetch(`/api/projects/${projectId}/env-vars`, {
        method: 'POST',
        body: JSON.stringify({ name, value }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear la variable de entorno')
      }

      setNewEnvVarName('')
      setNewEnvVarValue('')
      await loadEnvVars()
    } catch (err) {
      setEnvVarsError(err instanceof Error ? err.message : 'No se pudo crear la variable de entorno')
    } finally {
      setCreatingEnvVar(false)
    }
  }

  async function handleDeleteEnvVar(envVarId: string) {
    await apiFetch(`/api/projects/${projectId}/env-vars/${envVarId}`, { method: 'DELETE' })
    await loadEnvVars()
  }

  async function handleDelete() {
    setDeleting(true)
    await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    router.push(`/app/contacts/${id}`)
  }

  if (notFound) {
    return (
      <div className="page">
        <p className="empty-state">Este proyecto no existe.</p>
        <Link href={`/app/contacts/${id}`} className="btn-ghost" style={{ alignSelf: 'flex-start' }}>Volver al contacto</Link>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="page">
        <p className="empty-state">Cargando…</p>
      </div>
    )
  }

  const accountEntries = Object.entries(project.accounts).filter(([, value]) => value !== '')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href={`/app/contacts/${id}`} className="back-link">← Volver al contacto</Link>
          <h1>{project.name}</h1>
        </div>
        <button className="link-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Eliminando…' : 'Eliminar proyecto'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="panel">
        <h2>Datos del proyecto</h2>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <div className="detail-form-grid">
            <div className="inline-field">
              <label htmlFor="project-name">Nombre</label>
              <input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="inline-field">
              <label htmlFor="project-platform">Plataforma</label>
              <input
                id="project-platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="WordPress, Next.js, Shopify…"
              />
            </div>
            <div className="inline-field span-2">
              <label htmlFor="project-url">Sitio</label>
              <input id="project-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="inline-field span-2">
              <label htmlFor="project-notes">Notas</label>
              <textarea id="project-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Cuentas digitales</h2>
        <p className="audit-intro">
          Referencias de qué cuenta se usa para cada servicio (ej. "Google Analytics" → email de la cuenta).
          No guardes contraseñas acá — para credenciales reales usá tu gestor de contraseñas.
        </p>

        {accountsError && (
          <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{accountsError}</div>
        )}

        {accountEntries.length === 0 ? (
          <p className="empty-state">Todavía no cargaste ninguna cuenta.</p>
        ) : (
          <ul className="account-list">
            {accountEntries.map(([label, value]) => (
              <li key={label} className="account-item">
                <span className="account-item-label">{label}</span>
                <span className="account-item-value">{value}</span>
                <button type="button" className="tag-chip-remove" onClick={() => handleRemoveAccount(label)}>✕</button>
              </li>
            ))}
          </ul>
        )}

        <form className="inline-form" onSubmit={handleAddAccount} style={{ marginTop: 'var(--spacing-4)' }}>
          <div className="inline-field">
            <label htmlFor="account-label">Servicio</label>
            <input
              id="account-label"
              value={newAccountLabel}
              onChange={(e) => setNewAccountLabel(e.target.value)}
              placeholder="Google Analytics, Hosting…"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="account-value">Cuenta / identificador</label>
            <input
              id="account-value"
              value={newAccountValue}
              onChange={(e) => setNewAccountValue(e.target.value)}
              placeholder="cliente@gmail.com"
            />
          </div>
          <button type="submit" className="btn-ghost" disabled={savingAccount || !newAccountLabel.trim() || !newAccountValue.trim()}>
            {savingAccount ? 'Agregando…' : 'Agregar'}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Vencimientos y mantenimiento</h2>
        <p className="audit-intro">
          Cuando se acerca la fecha, se crea automáticamente una Tarea interna — no se le avisa al cliente.
        </p>

        {remindersError && (
          <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{remindersError}</div>
        )}

        {!reminders ? (
          <p className="empty-state">Cargando…</p>
        ) : reminders.length === 0 ? (
          <p className="empty-state">Todavía no hay vencimientos cargados.</p>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 'var(--spacing-4)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Vencimiento</th>
                  <th>Monto</th>
                  <th>Recurrencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((reminder) => (
                  <tr key={reminder.id}>
                    <td><span className={`pill pill-kind-${reminder.kind}`}>{KIND_LABELS[reminder.kind]}</span></td>
                    <td>{reminder.description}</td>
                    <td>{formatDueDate(reminder.dueDate)}</td>
                    <td>{formatAmount(reminder.amount, reminder.currency)}</td>
                    <td>{RECURRENCE_LABELS[reminder.recurrence]}</td>
                    <td><button className="link-danger" onClick={() => handleDeleteReminder(reminder.id)}>Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="inline-form" onSubmit={handleCreateReminder}>
          <div className="inline-field">
            <label htmlFor="reminder-kind">Tipo</label>
            <select id="reminder-kind" value={reminderKind} onChange={(e) => setReminderKind(e.target.value as ProjectReminderKind)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="reminder-description">Descripción</label>
            <input
              id="reminder-description" required
              value={reminderDescription}
              onChange={(e) => setReminderDescription(e.target.value)}
              placeholder="Renovación anual — Hostinger"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="reminder-due-date">Vencimiento</label>
            <input
              id="reminder-due-date" type="date" required
              value={reminderDueDate}
              onChange={(e) => setReminderDueDate(e.target.value)}
            />
          </div>
          <div className="inline-field">
            <label htmlFor="reminder-amount">Monto (opcional)</label>
            <input
              id="reminder-amount" type="number" min="0" step="0.01"
              value={reminderAmount}
              onChange={(e) => setReminderAmount(e.target.value)}
              placeholder="15.00"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="reminder-currency">Moneda</label>
            <select id="reminder-currency" value={reminderCurrency} onChange={(e) => setReminderCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="ARS">ARS</option>
              <option value="CLP">CLP</option>
              <option value="BRL">BRL</option>
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="reminder-recurrence">Recurrencia</label>
            <select
              id="reminder-recurrence"
              value={reminderRecurrence}
              onChange={(e) => setReminderRecurrence(e.target.value as ProjectReminderRecurrence)}
            >
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="reminder-days-before">Avisar con cuántos días de anticipación</label>
            <input
              id="reminder-days-before" type="number" min="0" step="1"
              value={reminderDaysBefore}
              onChange={(e) => setReminderDaysBefore(e.target.value)}
              placeholder="7"
            />
          </div>
          <button type="submit" className="btn" disabled={creatingReminder}>
            {creatingReminder ? 'Agregando…' : 'Agregar vencimiento'}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Variables de entorno</h2>

        {envVarsError && (
          <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{envVarsError}</div>
        )}

        {!envVars ? (
          <p className="empty-state">Cargando…</p>
        ) : envVars.length === 0 ? (
          <p className="empty-state">Todavía no hay variables de entorno cargadas.</p>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 'var(--spacing-4)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Valor</th>
                  <th>Creada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {envVars.map((envVar) => (
                  <tr key={envVar.id}>
                    <td>{envVar.name}</td>
                    <td>{envVar.value}</td>
                    <td>{formatCreatedAt(envVar.createdAt)}</td>
                    <td><button className="link-danger" onClick={() => handleDeleteEnvVar(envVar.id)}>Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="inline-form" onSubmit={handleCreateEnvVar}>
          <div className="inline-field">
            <label htmlFor="env-var-name">Nombre</label>
            <input
              id="env-var-name" required
              value={newEnvVarName}
              onChange={(e) => setNewEnvVarName(e.target.value)}
              placeholder="DATABASE_URL"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="env-var-value">Valor</label>
            <input
              id="env-var-value" required
              value={newEnvVarValue}
              onChange={(e) => setNewEnvVarValue(e.target.value)}
              placeholder="postgres://…"
            />
          </div>
          <button type="submit" className="btn" disabled={creatingEnvVar || !newEnvVarName.trim() || !newEnvVarValue.trim()}>
            {creatingEnvVar ? 'Agregando…' : 'Agregar variable'}
          </button>
        </form>
      </div>
    </div>
  )
}
