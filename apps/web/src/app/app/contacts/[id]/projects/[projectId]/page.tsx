'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProjectReminderKind, ProjectReminderRecurrence } from '@colonia-crm/shared'
import { useApp } from '../../../../app-context'
import { getApiUrl } from '@/lib/api-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type Project = {
  id: string
  contactId: string
  name: string
  platform: string | null
  url: string | null
  notes: string | null
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

type AccountItem = {
  id: string
  label: string
  value: string
  createdAt: string
}

type AccountFileItem = {
  id: string
  accountId: string
  fileName: string
  mimeType: string
  fileSize: number
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

const ACCOUNT_FILE_ACCEPT = '.txt,.md,.csv,.json,.log,.yml,.yaml,.xml,.env,.pdf'

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Parser simple de .env: KEY=VALUE por línea, ignora comentarios (#) y
// líneas vacías, soporta "export KEY=..." y saca comillas envolventes.
function parseEnvFile(text: string): { name: string; value: string }[] {
  const result: { name: string; value: string }[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line
    const eqIndex = withoutExport.indexOf('=')
    if (eqIndex === -1) continue

    const name = withoutExport.slice(0, eqIndex).trim()
    let value = withoutExport.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }

    if (name) result.push({ name, value })
  }

  return result
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
  const [mode, setMode]         = useState<'view' | 'edit'>('view')

  const [name, setName]         = useState('')
  const [platform, setPlatform] = useState('')
  const [url, setUrl]           = useState('')
  const [notes, setNotes]       = useState('')

  const [accounts, setAccounts]               = useState<AccountItem[] | null>(null)
  const [accountsError, setAccountsError]     = useState<string | null>(null)
  const [newAccountLabel, setNewAccountLabel] = useState('')
  const [newAccountValue, setNewAccountValue] = useState('')
  const [savingAccount, setSavingAccount]     = useState(false)
  const [filesByAccount, setFilesByAccount]   = useState<Record<string, AccountFileItem[]>>({})
  const [uploadingAccountId, setUploadingAccountId] = useState<string | null>(null)

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

  const [envVars, setEnvVars]               = useState<EnvVarItem[] | null>(null)
  const [envVarsError, setEnvVarsError]     = useState<string | null>(null)
  const [creatingEnvVar, setCreatingEnvVar] = useState(false)
  const [newEnvVarName, setNewEnvVarName]   = useState('')
  const [newEnvVarValue, setNewEnvVarValue] = useState('')
  const [importingEnv, setImportingEnv]     = useState(false)

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

  async function loadAccountFiles(accountId: string) {
    const res = await apiFetch(`/api/projects/${projectId}/accounts/${accountId}/files`)
    const data = await res.json() as { items: AccountFileItem[] }
    setFilesByAccount((prev) => ({ ...prev, [accountId]: data.items }))
  }

  async function loadAccounts() {
    const res = await apiFetch(`/api/projects/${projectId}/accounts`)
    const data = await res.json() as { items: AccountItem[] }
    setAccounts(data.items)
    await Promise.all(data.items.map((acc) => loadAccountFiles(acc.id)))
  }

  useEffect(() => {
    let cancelled = false

    loadAccounts().catch(() => { if (!cancelled) setAccountsError('No se pudieron cargar las cuentas') })

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

  function handleCancelEdit() {
    if (project) {
      setName(project.name)
      setPlatform(project.platform ?? '')
      setUrl(project.url ?? '')
      setNotes(project.notes ?? '')
    }
    setMode('view')
  }

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
      setMode('view')
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
      const res = await apiFetch(`/api/projects/${projectId}/accounts`, {
        method: 'POST',
        body: JSON.stringify({ label, value }),
      })
      if (!res.ok) {
        throw new Error('No se pudo guardar la cuenta')
      }
      setNewAccountLabel('')
      setNewAccountValue('')
      await loadAccounts()
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta')
    } finally {
      setSavingAccount(false)
    }
  }

  async function handleRemoveAccount(accountId: string) {
    setAccountsError(null)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/accounts/${accountId}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error('No se pudo quitar la cuenta')
      }
      await loadAccounts()
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'No se pudo quitar la cuenta')
    }
  }

  async function handleUploadFile(accountId: string, file: File) {
    setAccountsError(null)
    setUploadingAccountId(accountId)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await apiFetch(`/api/projects/${projectId}/accounts/${accountId}/files`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo subir el archivo')
      }

      await loadAccountFiles(accountId)
    } catch (err) {
      setAccountsError(err instanceof Error ? err.message : 'No se pudo subir el archivo')
    } finally {
      setUploadingAccountId(null)
    }
  }

  async function handleDeleteFile(accountId: string, fileId: string) {
    await apiFetch(`/api/projects/${projectId}/accounts/${accountId}/files/${fileId}`, { method: 'DELETE' })
    await loadAccountFiles(accountId)
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

  async function handleImportEnvFile(file: File) {
    setEnvVarsError(null)
    setImportingEnv(true)

    try {
      const text = await file.text()
      const vars = parseEnvFile(text)

      if (vars.length === 0) {
        throw new Error('No se encontraron variables válidas en el archivo')
      }

      const res = await apiFetch(`/api/projects/${projectId}/env-vars/import`, {
        method: 'POST',
        body: JSON.stringify({ vars }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo importar el archivo')
      }

      await loadEnvVars()
    } catch (err) {
      setEnvVarsError(err instanceof Error ? err.message : 'No se pudo importar el archivo')
    } finally {
      setImportingEnv(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    router.push(`/app/contacts/${id}`)
  }

  if (notFound) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <p className="py-10 text-center text-sm text-muted-foreground">Este proyecto no existe.</p>
        <Button variant="outline" className="self-start" nativeButton={false} render={<Link href={`/app/contacts/${id}`}>Volver al contacto</Link>} />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/app/contacts/${id}`} className="text-sm text-muted-foreground hover:underline">← Volver al contacto</Link>
          <h1 className="text-xl font-semibold">{project.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'view' ? (
            <Button type="button" variant="outline" onClick={() => setMode('edit')}>Editar</Button>
          ) : (
            <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={saving}>Cancelar</Button>
          )}
          <Button
            variant="ghost" className="text-muted-foreground hover:text-destructive"
            onClick={handleDelete} disabled={deleting}
          >
            {deleting ? 'Eliminando…' : 'Eliminar proyecto'}
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-semibold">Datos del proyecto</h2>
          {mode === 'view' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-0.5 text-xs text-muted-foreground">Nombre</div>
                <div className="text-sm">{project.name}</div>
              </div>
              <div>
                <div className="mb-0.5 text-xs text-muted-foreground">Plataforma</div>
                <div className={`text-sm ${project.platform ? '' : 'text-muted-foreground'}`}>
                  {project.platform || 'Sin especificar'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-0.5 text-xs text-muted-foreground">Sitio</div>
                {project.url ? (
                  <a className="text-sm hover:underline" href={project.url} target="_blank" rel="noreferrer">{project.url}</a>
                ) : (
                  <div className="text-sm text-muted-foreground">Sin cargar</div>
                )}
              </div>
              <div className="sm:col-span-2">
                <div className="mb-0.5 text-xs text-muted-foreground">Notas</div>
                <div className={`whitespace-pre-wrap text-sm ${project.notes ? '' : 'text-muted-foreground'}`}>
                  {project.notes || 'Sin notas'}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-name">Nombre</Label>
                  <Input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-platform">Plataforma</Label>
                  <Input
                    id="project-platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    placeholder="WordPress, Next.js, Shopify…"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="project-url">Sitio</Label>
                  <Input id="project-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="project-notes">Notas</Label>
                  <Textarea id="project-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <Button type="submit" className="self-start" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="text-base font-semibold">Cuentas digitales</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Referencias de qué cuenta se usa para cada servicio (ej. &quot;Google Analytics&quot; → email de la cuenta).
              No guardes contraseñas acá — para credenciales reales usá tu gestor de contraseñas.
            </p>

            {accountsError && (
              <Alert variant="destructive" className="mb-3"><AlertDescription>{accountsError}</AlertDescription></Alert>
            )}

            {!accounts ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : accounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Todavía no cargaste ninguna cuenta.</p>
            ) : (
              <ul className="mb-4 flex flex-col gap-3">
                {accounts.map((account) => (
                  <li key={account.id} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{account.label}</span>
                      <span className="flex-1 text-muted-foreground">{account.value}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveAccount(account.id)}
                      >
                        ✕
                      </button>
                    </div>

                    {(filesByAccount[account.id] ?? []).length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {filesByAccount[account.id]!.map((file) => (
                          <li key={file.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
                            <a
                              className="flex-1 truncate hover:underline"
                              href={`${getApiUrl()}/api/projects/${projectId}/accounts/${account.id}/files/${file.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {file.fileName}
                            </a>
                            <span className="text-muted-foreground">{formatFileSize(file.fileSize)}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteFile(account.id, file.id)}
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Adjuntar archivo (opcional, texto o PDF):
                      <input
                        type="file"
                        accept={ACCOUNT_FILE_ACCEPT}
                        disabled={uploadingAccountId === account.id}
                        className="text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleUploadFile(account.id, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <form className="flex flex-wrap items-end gap-4" onSubmit={handleAddAccount}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-label">Servicio</Label>
                <Input
                  id="account-label"
                  value={newAccountLabel}
                  onChange={(e) => setNewAccountLabel(e.target.value)}
                  placeholder="Google Analytics, Hosting…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-value">Cuenta / identificador</Label>
                <Input
                  id="account-value"
                  value={newAccountValue}
                  onChange={(e) => setNewAccountValue(e.target.value)}
                  placeholder="cliente@gmail.com"
                />
              </div>
              <Button type="submit" variant="outline" disabled={savingAccount || !newAccountLabel.trim() || !newAccountValue.trim()}>
                {savingAccount ? 'Agregando…' : 'Agregar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 text-base font-semibold">Variables de entorno</h2>

            {envVarsError && (
              <Alert variant="destructive" className="mb-3"><AlertDescription>{envVarsError}</AlertDescription></Alert>
            )}

            {!envVars ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : envVars.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay variables de entorno cargadas.</p>
            ) : (
              <div className="mb-4 overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Creada</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {envVars.map((envVar) => (
                      <TableRow key={envVar.id}>
                        <TableCell>{envVar.name}</TableCell>
                        <TableCell>{envVar.value}</TableCell>
                        <TableCell>{formatCreatedAt(envVar.createdAt)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteEnvVar(envVar.id)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreateEnvVar}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="env-var-name">Nombre</Label>
                <Input
                  id="env-var-name" required
                  value={newEnvVarName}
                  onChange={(e) => setNewEnvVarName(e.target.value)}
                  placeholder="DATABASE_URL"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="env-var-value">Valor</Label>
                <Input
                  id="env-var-value" required
                  value={newEnvVarValue}
                  onChange={(e) => setNewEnvVarValue(e.target.value)}
                  placeholder="postgres://…"
                />
              </div>
              <Button type="submit" disabled={creatingEnvVar || !newEnvVarName.trim() || !newEnvVarValue.trim()}>
                {creatingEnvVar ? 'Agregando…' : 'Agregar variable'}
              </Button>
            </form>

            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="env-var-import">Importar desde archivo .env</Label>
              <input
                id="env-var-import"
                type="file"
                accept=".env,text/plain"
                disabled={importingEnv}
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportEnvFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <h2 className="text-base font-semibold">Vencimientos y mantenimiento</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Cuando se acerca la fecha, se crea automáticamente una Tarea interna — no se le avisa al cliente.
          </p>

          {remindersError && (
            <Alert variant="destructive" className="mb-3"><AlertDescription>{remindersError}</AlertDescription></Alert>
          )}

          {!reminders ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : reminders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay vencimientos cargados.</p>
          ) : (
            <div className="mb-4 overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Recurrencia</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((reminder) => (
                    <TableRow key={reminder.id}>
                      <TableCell><Badge variant="secondary">{KIND_LABELS[reminder.kind]}</Badge></TableCell>
                      <TableCell>{reminder.description}</TableCell>
                      <TableCell>{formatDueDate(reminder.dueDate)}</TableCell>
                      <TableCell>{formatAmount(reminder.amount, reminder.currency)}</TableCell>
                      <TableCell>{RECURRENCE_LABELS[reminder.recurrence]}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteReminder(reminder.id)}
                        >
                          Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreateReminder}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-kind">Tipo</Label>
              <Select value={reminderKind} onValueChange={(value) => value && setReminderKind(value as ProjectReminderKind)}>
                <SelectTrigger id="reminder-kind" className="w-36">
                  <SelectValue>{(value: string) => KIND_LABELS[value as ProjectReminderKind] ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-description">Descripción</Label>
              <Input
                id="reminder-description" required
                value={reminderDescription}
                onChange={(e) => setReminderDescription(e.target.value)}
                placeholder="Renovación anual — Hostinger"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-due-date">Vencimiento</Label>
              <Input
                id="reminder-due-date" type="date" required
                value={reminderDueDate}
                onChange={(e) => setReminderDueDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-amount">Monto (opcional)</Label>
              <Input
                id="reminder-amount" type="number" min="0" step="0.01"
                value={reminderAmount}
                onChange={(e) => setReminderAmount(e.target.value)}
                placeholder="15.00"
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-currency">Moneda</Label>
              <Select value={reminderCurrency} onValueChange={(value) => value && setReminderCurrency(value)}>
                <SelectTrigger id="reminder-currency" className="w-24">
                  <SelectValue>{(value: string) => value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {['USD', 'UYU', 'ARS', 'CLP', 'BRL'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-recurrence">Recurrencia</Label>
              <Select
                value={reminderRecurrence}
                onValueChange={(value) => value && setReminderRecurrence(value as ProjectReminderRecurrence)}
              >
                <SelectTrigger id="reminder-recurrence" className="w-32">
                  <SelectValue>{(value: string) => RECURRENCE_LABELS[value as ProjectReminderRecurrence] ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reminder-days-before">Avisar con cuántos días de anticipación</Label>
              <Input
                id="reminder-days-before" type="number" min="0" step="1"
                value={reminderDaysBefore}
                onChange={(e) => setReminderDaysBefore(e.target.value)}
                placeholder="7"
                className="w-20"
              />
            </div>
            <Button type="submit" disabled={creatingReminder}>
              {creatingReminder ? 'Agregando…' : 'Agregar vencimiento'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
