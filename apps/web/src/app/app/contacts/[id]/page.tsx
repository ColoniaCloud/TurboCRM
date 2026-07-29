'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ActivityType, ContactStatus, CustomFieldType } from '@colonia-crm/shared'
import { useApp } from '../../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type CustomFieldValue = string | number | boolean | null

type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  status: ContactStatus
  notes: string | null
  customFields: Record<string, CustomFieldValue>
}

type TagItem = { id: string; name: string; color: string | null }

type Activity = {
  id: string
  type: ActivityType
  content: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

type FieldDefinition = {
  id: string
  key: string
  label: string
  fieldType: CustomFieldType
  options: string[] | null
  required: boolean
}

type ProjectListItem = {
  id: string
  name: string
  platform: string | null
  createdAt: string
}

type AuditItem = {
  id: string
  publicUrl: string
  createdAt: string
  data: {
    tipo: 'auditoria' | 'oportunidad'
    resumen: string
    whatsappMessage: string
  }
}

const SOCIAL_FIELD_PREFIX = 'social_'

function getContactLinks(contact: Contact): { googleMapsUrl: string | null; website: string | null } {
  const raw = contact.customFields as Record<string, unknown>
  return {
    googleMapsUrl: typeof raw.google_maps_url === 'string' ? raw.google_maps_url : null,
    website:       typeof raw.website === 'string' ? raw.website : null,
  }
}

function getSocialLinks(contact: Contact): { platform: string; url: string }[] {
  const raw = contact.customFields as Record<string, unknown>
  return Object.entries(raw)
    .filter((entry): entry is [string, string] => entry[0].startsWith(SOCIAL_FIELD_PREFIX) && typeof entry[1] === 'string')
    .map(([key, url]) => ({
      platform: key.slice(SOCIAL_FIELD_PREFIX.length).replace(/^\w/, (c) => c.toUpperCase()),
      url,
    }))
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospecto',
  client:   'Cliente',
  inactive: 'Inactivo',
}

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// whatsapp_message, email, payment_due y payment_received tienen formato
// propio; scrape_enriched queda cubierto por el default genérico.
function describeActivity(activity: Activity): string {
  if (activity.type === 'created') return 'Contacto creado'
  if (activity.type === 'status_change') {
    const from = activity.metadata?.from as string | undefined
    const to   = activity.metadata?.to as string | undefined
    const fromLabel = from ? (STATUS_LABELS[from as ContactStatus] ?? from) : '—'
    const toLabel   = to ? (STATUS_LABELS[to as ContactStatus] ?? to) : '—'
    return `Estado cambiado de ${fromLabel} a ${toLabel}`
  }
  if (activity.type === 'note') return activity.content ?? ''
  if (activity.type === 'whatsapp_message') {
    const direction = activity.metadata?.direction as string | undefined
    if (direction === 'outgoing') return `WhatsApp enviado: ${activity.content}`
    if (direction === 'incoming') return `WhatsApp recibido: ${activity.content}`
  }
  if (activity.type === 'email') {
    const direction = activity.metadata?.direction as string | undefined
    const subject   = activity.metadata?.subject as string | undefined
    const campaign  = activity.metadata?.campaign === true
    if (direction === 'outgoing') return `Email enviado: ${subject}${campaign ? ' (campaña)' : ''}`
    if (direction === 'incoming') return `Email recibido: ${subject}`
  }
  if (activity.type === 'payment_due') {
    return `Recordatorio de pago enviado — ${activity.metadata?.amount} ${activity.metadata?.currency}`
  }
  if (activity.type === 'payment_received') {
    return `Pago recibido — ${activity.metadata?.amount} ${activity.metadata?.currency}`
  }
  if (activity.type === 'audit_generated') {
    return `Auditoría digital generada: ${activity.content ?? ''}`
  }
  if (activity.type === 'project_created') {
    return activity.content ?? 'Proyecto creado'
  }
  if (activity.type === 'project_reminder_due') {
    return `Vencimiento de proyecto: ${activity.content ?? ''}`
  }
  return activity.content ?? 'Contacto actualizado'
}

export default function ContactDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()
  const { apiFetch } = useApp()

  const [contact, setContact]   = useState<Contact | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [companyName, setCompanyName] = useState('')
  const [status, setStatus]           = useState<ContactStatus>('lead')
  const [notes, setNotes]             = useState('')

  const [allTags, setAllTags]           = useState<TagItem[] | null>(null)
  const [contactTagIds, setContactTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName]     = useState('')
  const [creatingTag, setCreatingTag]   = useState(false)
  const [tagError, setTagError]         = useState<string | null>(null)

  const [projectsList, setProjectsList]   = useState<ProjectListItem[] | null>(null)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [newProjectName, setNewProjectName]         = useState('')
  const [newProjectPlatform, setNewProjectPlatform] = useState('')
  const [creatingProject, setCreatingProject]       = useState(false)

  const [customFieldDefs, setCustomFieldDefs] = useState<FieldDefinition[] | null>(null)
  const [fieldValues, setFieldValues]         = useState<Record<string, string | boolean>>({})
  const [savingFields, setSavingFields]       = useState(false)
  const [fieldsError, setFieldsError]         = useState<string | null>(null)

  const [activities, setActivities]           = useState<Activity[] | null>(null)
  const [activitiesError, setActivitiesError] = useState<string | null>(null)
  const [noteContent, setNoteContent]         = useState('')
  const [addingNote, setAddingNote]           = useState(false)

  const [whatsappMessage, setWhatsappMessage]   = useState('')
  const [sendingWhatsapp, setSendingWhatsapp]   = useState(false)
  const [whatsappError, setWhatsappError]       = useState<string | null>(null)

  const [emailSubject, setEmailSubject] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailError, setEmailError]     = useState<string | null>(null)

  const [auditsList, setAuditsList]         = useState<AuditItem[] | null>(null)
  const [generatingAudit, setGeneratingAudit] = useState(false)
  const [auditError, setAuditError]         = useState<string | null>(null)
  const [sendingAuditVia, setSendingAuditVia] = useState<string | null>(null)
  const [auditSent, setAuditSent]           = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await apiFetch(`/api/contacts/${id}`)

      if (res.status === 404) {
        if (!cancelled) setNotFound(true)
        return
      }
      if (!res.ok) {
        throw new Error('No se pudo cargar el contacto')
      }

      const data = await res.json() as { item: Contact }

      if (!cancelled) {
        setContact(data.item)
        setName(data.item.name)
        setEmail(data.item.email ?? '')
        setPhone(data.item.phone ?? '')
        setCompanyName(data.item.companyName ?? '')
        setStatus(data.item.status)
        setNotes(data.item.notes ?? '')
      }
    }

    load().catch(() => { if (!cancelled) setError('No se pudo cargar el contacto') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    let cancelled = false

    async function loadTags() {
      const [allRes, contactRes] = await Promise.all([
        apiFetch('/api/tags'),
        apiFetch(`/api/contacts/${id}/tags`),
      ])
      const allData     = await allRes.json() as { items: TagItem[] }
      const contactData = await contactRes.json() as { items: TagItem[] }

      if (!cancelled) {
        setAllTags(allData.items)
        setContactTagIds(new Set(contactData.items.map((t) => t.id)))
      }
    }

    loadTags().catch(() => { if (!cancelled) setTagError('No se pudieron cargar las etiquetas') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    let cancelled = false

    async function loadProjects() {
      const res  = await apiFetch(`/api/projects?contactId=${id}`)
      const data = await res.json() as { items: ProjectListItem[] }
      if (!cancelled) setProjectsList(data.items)
    }

    loadProjects().catch(() => { if (!cancelled) setProjectsError('No se pudieron cargar los proyectos') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  async function handleCreateProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newProjectName.trim()
    if (!name) return

    setCreatingProject(true)
    setProjectsError(null)

    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ contactId: id, name, platform: newProjectPlatform.trim() || undefined }),
      })
      const body = await res.json().catch(() => null) as { item?: ProjectListItem; error?: string } | null
      if (!res.ok || !body?.item) {
        throw new Error(body?.error ?? 'No se pudo crear el proyecto')
      }
      router.push(`/app/contacts/${id}/projects/${body.item.id}`)
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : 'No se pudo crear el proyecto')
    } finally {
      setCreatingProject(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadDefs() {
      const res  = await apiFetch('/api/custom-fields?entityType=contact')
      const data = await res.json() as { items: FieldDefinition[] }
      if (!cancelled) setCustomFieldDefs(data.items)
    }

    loadDefs().catch(() => { if (!cancelled) setFieldsError('No se pudieron cargar los campos personalizados') })

    return () => { cancelled = true }
  }, [apiFetch])

  async function loadActivities() {
    const res  = await apiFetch(`/api/contacts/${id}/activities`)
    const data = await res.json() as { items: Activity[] }
    setActivities(data.items)
  }

  useEffect(() => {
    let cancelled = false

    loadActivities().catch(() => { if (!cancelled) setActivitiesError('No se pudo cargar la actividad') })

    return () => { cancelled = true }
  }, [apiFetch, id])

  useEffect(() => {
    if (!contact || !customFieldDefs) return

    const initial: Record<string, string | boolean> = {}
    for (const def of customFieldDefs) {
      const raw = contact.customFields[def.key]
      if (def.fieldType === 'boolean') {
        initial[def.key] = Boolean(raw)
      } else if (def.fieldType === 'date' && raw) {
        initial[def.key] = String(raw).slice(0, 10)
      } else {
        initial[def.key] = raw === null || raw === undefined ? '' : String(raw)
      }
    }
    setFieldValues(initial)
  }, [contact, customFieldDefs])

  function setFieldValue(key: string, value: string | boolean) {
    setFieldValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSaveFields(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFieldsError(null)
    setSavingFields(true)

    try {
      const res = await apiFetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ customFields: fieldValues }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudieron guardar los campos')
      }

      const data = await res.json() as { item: Contact }
      setContact(data.item)
    } catch (err: unknown) {
      setFieldsError(err instanceof Error ? err.message : 'No se pudieron guardar los campos')
    } finally {
      setSavingFields(false)
    }
  }

  async function persistTags(nextIds: Set<string>) {
    const res = await apiFetch(`/api/contacts/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagIds: Array.from(nextIds) }),
    })
    if (!res.ok) {
      throw new Error('No se pudieron actualizar las etiquetas')
    }
  }

  async function toggleTag(tagId: string) {
    const previous = contactTagIds
    const next = new Set(previous)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)

    setContactTagIds(next)
    setTagError(null)

    try {
      await persistTags(next)
    } catch (err) {
      setContactTagIds(previous)
      setTagError(err instanceof Error ? err.message : 'No se pudo actualizar la etiqueta')
    }
  }

  async function handleAddTag(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = newTagName.trim()
    if (!trimmed) return

    setCreatingTag(true)
    setTagError(null)

    try {
      const res = await apiFetch('/api/tags', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        throw new Error('No se pudo crear la etiqueta')
      }

      const data = await res.json() as { item: TagItem }

      setAllTags((prev) => {
        const list = prev ?? []
        return list.some((t) => t.id === data.item.id)
          ? list
          : [...list, data.item].sort((a, b) => a.name.localeCompare(b.name))
      })

      const next = new Set(contactTagIds).add(data.item.id)
      setContactTagIds(next)
      await persistTags(next)
      setNewTagName('')
    } catch (err) {
      setTagError(err instanceof Error ? err.message : 'No se pudo crear la etiqueta')
    } finally {
      setCreatingTag(false)
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await apiFetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, email, phone, companyName, status, notes }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo guardar el contacto')
      }

      const data = await res.json() as { item: Contact }
      setContact(data.item)
      await loadActivities()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el contacto')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = noteContent.trim()
    if (!trimmed) return

    setAddingNote(true)
    setActivitiesError(null)

    try {
      const res = await apiFetch(`/api/contacts/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      if (!res.ok) {
        throw new Error('No se pudo agregar la nota')
      }
      setNoteContent('')
      await loadActivities()
    } catch (err) {
      setActivitiesError(err instanceof Error ? err.message : 'No se pudo agregar la nota')
    } finally {
      setAddingNote(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadAudits() {
      const res  = await apiFetch(`/api/audits?contactId=${id}`)
      const data = await res.json() as { items: AuditItem[] }
      if (!cancelled) setAuditsList(data.items)
    }

    loadAudits().catch(() => { if (!cancelled) setAuditsList([]) })

    return () => { cancelled = true }
  }, [apiFetch, id])

  async function handleGenerateAudit() {
    setGeneratingAudit(true)
    setAuditError(null)

    try {
      const res = await apiFetch('/api/audits', {
        method: 'POST',
        body: JSON.stringify({ contactId: id }),
      })

      const body = await res.json().catch(() => null) as { item?: AuditItem; error?: string } | null
      if (!res.ok || !body?.item) {
        throw new Error(body?.error ?? 'No se pudo generar la auditoría')
      }

      setAuditsList((prev) => [body.item!, ...(prev ?? [])])
      await loadActivities()
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'No se pudo generar la auditoría')
    } finally {
      setGeneratingAudit(false)
    }
  }

  function auditOutreachMessage(audit: AuditItem): string {
    return `${audit.data.whatsappMessage}\n\n👉 Mirá el informe completo acá: ${audit.publicUrl}`
  }

  async function handleSendAudit(audit: AuditItem, via: 'whatsapp' | 'email') {
    setSendingAuditVia(`${audit.id}:${via}`)
    setAuditError(null)
    setAuditSent(null)

    try {
      const res = via === 'whatsapp'
        ? await apiFetch('/api/whatsapp/send', {
            method: 'POST',
            body: JSON.stringify({ contactId: id, message: auditOutreachMessage(audit) }),
          })
        : await apiFetch('/api/email/send', {
            method: 'POST',
            body: JSON.stringify({
              contactId: id,
              subject: 'Tu auditoría digital gratuita — Colonia Cloud',
              message: auditOutreachMessage(audit),
            }),
          })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo enviar la auditoría')
      }

      setAuditSent(audit.id)
      await loadActivities()
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'No se pudo enviar la auditoría')
    } finally {
      setSendingAuditVia(null)
    }
  }

  async function handleSendWhatsapp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = whatsappMessage.trim()
    if (!trimmed) return

    setSendingWhatsapp(true)
    setWhatsappError(null)

    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ contactId: id, message: trimmed }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo enviar el mensaje de WhatsApp')
      }

      setWhatsappMessage('')
      await loadActivities()
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje de WhatsApp')
    } finally {
      setSendingWhatsapp(false)
    }
  }

  async function handleSendEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const subject = emailSubject.trim()
    const message = emailMessage.trim()
    if (!subject || !message) return

    setSendingEmail(true)
    setEmailError(null)

    try {
      const res = await apiFetch('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({ contactId: id, subject, message }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo enviar el email')
      }

      setEmailSubject('')
      setEmailMessage('')
      await loadActivities()
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'No se pudo enviar el email')
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
    router.push('/app/contacts')
  }

  if (notFound) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <p className="py-10 text-center text-sm text-muted-foreground">Este contacto no existe.</p>
        <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/app/contacts">Volver a contactos</Link>} />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  const { googleMapsUrl, website } = getContactLinks(contact)
  const socialLinks = getSocialLinks(contact)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/app/contacts" className="text-sm text-muted-foreground hover:underline">← Contactos</Link>
          <h1 className="text-xl font-semibold">{contact.name}</h1>
        </div>
        <Button
          variant="ghost" className="text-muted-foreground hover:text-destructive"
          onClick={handleDelete} disabled={deleting}
        >
          {deleting ? 'Eliminando…' : 'Eliminar contacto'}
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Datos del contacto</h2>
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-name">Nombre</Label>
                    <Input id="detail-name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-status">Estado</Label>
                    <Select value={status} onValueChange={(value) => value && setStatus(value as ContactStatus)}>
                      <SelectTrigger id="detail-status" className="w-full">
                        <SelectValue>{(value: string) => STATUS_LABELS[value as ContactStatus] ?? value}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-email">Email</Label>
                    <Input id="detail-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="detail-phone">Teléfono</Label>
                    <Input id="detail-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="detail-company">Empresa</Label>
                    <Input id="detail-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="detail-notes">Notas</Label>
                    <Textarea id="detail-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" className="self-start" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Proyectos</h2>

              {projectsError && (
                <Alert variant="destructive" className="mb-3"><AlertDescription>{projectsError}</AlertDescription></Alert>
              )}

              {!projectsList ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : projectsList.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay proyectos para este contacto.</p>
              ) : (
                <div className="mb-4 overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Nombre</TableHead><TableHead>Plataforma</TableHead><TableHead></TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectsList.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell>{project.name}</TableCell>
                          <TableCell>{project.platform ?? '—'}</TableCell>
                          <TableCell>
                            <Link href={`/app/contacts/${id}/projects/${project.id}`} className="text-sm hover:underline">Ver</Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreateProject}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-project-name">Nombre</Label>
                  <Input
                    id="new-project-name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Sitio web, tienda online…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-project-platform">Plataforma</Label>
                  <Input
                    id="new-project-platform"
                    value={newProjectPlatform}
                    onChange={(e) => setNewProjectPlatform(e.target.value)}
                    placeholder="WordPress, Next.js…"
                  />
                </div>
                <Button type="submit" disabled={creatingProject || !newProjectName.trim()}>
                  {creatingProject ? 'Creando…' : 'Crear proyecto'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {(googleMapsUrl || website) && (
            <Card>
              <CardContent>
                <h2 className="mb-3 text-base font-semibold">Enlaces</h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  {googleMapsUrl && (
                    <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">Ver en Google Maps</a>
                  )}
                  {website && (
                    <a href={website} target="_blank" rel="noopener noreferrer" className="hover:underline">Visitar sitio web</a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {socialLinks.length > 0 && (
            <Card>
              <CardContent>
                <h2 className="mb-3 text-base font-semibold">Redes sociales</h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  {socialLinks.map((link) => (
                    <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {link.platform}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Etiquetas</h2>

              {tagError && (
                <Alert variant="destructive" className="mb-3"><AlertDescription>{tagError}</AlertDescription></Alert>
              )}

              {!allTags ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {allTags.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Todavía no creaste etiquetas.</span>
                    ) : (
                      allTags.map((tag) => (
                        <Button
                          key={tag.id}
                          type="button"
                          size="sm"
                          variant={contactTagIds.has(tag.id) ? 'default' : 'secondary'}
                          onClick={() => toggleTag(tag.id)}
                        >
                          {tag.name}
                        </Button>
                      ))
                    )}
                  </div>
                  <form className="flex items-center gap-2" onSubmit={handleAddTag}>
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Nueva etiqueta"
                      className="h-8 w-48"
                    />
                    <Button type="submit" size="sm" variant="outline" disabled={creatingTag || !newTagName.trim()}>
                      {creatingTag ? 'Creando…' : 'Agregar'}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Campos personalizados</h2>

              {fieldsError && (
                <Alert variant="destructive" className="mb-3"><AlertDescription>{fieldsError}</AlertDescription></Alert>
              )}

              {!customFieldDefs ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : customFieldDefs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay campos personalizados. Podés crearlos en{' '}
                  <Link href="/app/settings" className="hover:underline">Configuración</Link>.
                </p>
              ) : (
                <form onSubmit={handleSaveFields} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {customFieldDefs.map((def) => (
                      <div key={def.id} className="flex flex-col gap-1.5">
                        <Label htmlFor={`cf-${def.key}`}>{def.label}{def.required ? ' *' : ''}</Label>
                        {def.fieldType === 'boolean' ? (
                          <div className="flex items-center pt-1">
                            <Checkbox
                              id={`cf-${def.key}`}
                              checked={Boolean(fieldValues[def.key])}
                              onCheckedChange={(checked) => setFieldValue(def.key, checked === true)}
                            />
                          </div>
                        ) : def.fieldType === 'select' ? (
                          <Select
                            value={(typeof fieldValues[def.key] === 'string' ? fieldValues[def.key] as string : '') || '__empty__'}
                            onValueChange={(value) => setFieldValue(def.key, !value || value === '__empty__' ? '' : value)}
                          >
                            <SelectTrigger id={`cf-${def.key}`} className="w-full">
                              <SelectValue>{(value: string) => value === '__empty__' || !value ? '—' : value}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__empty__">—</SelectItem>
                              {(def.options ?? []).map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`cf-${def.key}`}
                            type={def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text'}
                            value={typeof fieldValues[def.key] === 'string' ? fieldValues[def.key] as string : ''}
                            onChange={(e) => setFieldValue(def.key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <Button type="submit" className="self-start" disabled={savingFields}>
                    {savingFields ? 'Guardando…' : 'Guardar campos'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <h2 className="mb-1 text-base font-semibold">Auditoría con IA</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Analiza la presencia digital del negocio y genera un informe brandeado con link público para compartir.
              </p>

              {auditError && (
                <Alert variant="destructive" className="mb-3"><AlertDescription>{auditError}</AlertDescription></Alert>
              )}

              <Button
                type="button"
                className="mb-4"
                disabled={generatingAudit}
                onClick={handleGenerateAudit}
              >
                {generatingAudit ? 'Analizando con IA…' : 'Generar auditoría'}
              </Button>

              {generatingAudit && (
                <p className="mb-3 text-sm text-muted-foreground">
                  Revisando el sitio del negocio y redactando el informe — puede tardar medio minuto…
                </p>
              )}

              {!auditsList ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : auditsList.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Todavía no generaste ninguna auditoría.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {auditsList.map((audit) => (
                    <li key={audit.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{audit.data.tipo === 'auditoria' ? 'Auditoría' : 'Oportunidad'}</span>
                        <span className="text-muted-foreground">{formatActivityDate(audit.createdAt)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <a href={audit.publicUrl} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline">Ver informe</a>
                        {contact.phone && (
                          <Button
                            type="button"
                            variant="outline" size="sm"
                            disabled={sendingAuditVia !== null}
                            onClick={() => handleSendAudit(audit, 'whatsapp')}
                          >
                            {sendingAuditVia === `${audit.id}:whatsapp` ? 'Enviando…' : 'Enviar por WhatsApp'}
                          </Button>
                        )}
                        {contact.email && (
                          <Button
                            type="button"
                            variant="outline" size="sm"
                            disabled={sendingAuditVia !== null}
                            onClick={() => handleSendAudit(audit, 'email')}
                          >
                            {sendingAuditVia === `${audit.id}:email` ? 'Enviando…' : 'Enviar por Email'}
                          </Button>
                        )}
                      </div>
                      {auditSent === audit.id && (
                        <p className="mt-2 text-sm text-primary-foreground">Auditoría enviada al contacto.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Enviar WhatsApp</h2>

              {!contact.phone ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargá un teléfono para poder enviar WhatsApp.</p>
              ) : (
                <form onSubmit={handleSendWhatsapp} className="flex flex-col gap-3">
                  <Textarea
                    rows={3}
                    value={whatsappMessage}
                    onChange={(e) => setWhatsappMessage(e.target.value)}
                    placeholder="Escribí un mensaje…"
                  />
                  {whatsappError && (
                    <Alert variant="destructive"><AlertDescription>{whatsappError}</AlertDescription></Alert>
                  )}
                  <Button type="submit" className="self-start" disabled={sendingWhatsapp || !whatsappMessage.trim()}>
                    {sendingWhatsapp ? 'Enviando…' : 'Enviar WhatsApp'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Enviar Email</h2>

              {!contact.email ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargá un email para poder enviar correos.</p>
              ) : (
                <form onSubmit={handleSendEmail} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email-subject">Asunto</Label>
                    <Input
                      id="email-subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Asunto del email"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email-message">Mensaje</Label>
                    <Textarea
                      id="email-message"
                      rows={4}
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      placeholder="Escribí un mensaje…"
                    />
                  </div>
                  {emailError && (
                    <Alert variant="destructive"><AlertDescription>{emailError}</AlertDescription></Alert>
                  )}
                  <Button
                    type="submit"
                    className="self-start"
                    disabled={sendingEmail || !emailSubject.trim() || !emailMessage.trim()}
                  >
                    {sendingEmail ? 'Enviando…' : 'Enviar Email'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-3 text-base font-semibold">Actividad</h2>

              {activitiesError && (
                <Alert variant="destructive" className="mb-3"><AlertDescription>{activitiesError}</AlertDescription></Alert>
              )}

              <form className="mb-4 flex items-center gap-2" onSubmit={handleAddNote}>
                <Input
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Agregar una nota…"
                  className="h-8"
                />
                <Button type="submit" size="sm" variant="outline" disabled={addingNote || !noteContent.trim()}>
                  {addingNote ? 'Agregando…' : 'Agregar'}
                </Button>
              </form>

              {!activities ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
              ) : activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {activities.map((activity) => (
                    <li
                      key={activity.id}
                      className={`border-l-2 pl-4 ${activity.type === 'status_change' ? 'border-primary' : 'border-border'}`}
                    >
                      <p className="text-sm">{describeActivity(activity)}</p>
                      <span className="text-xs text-muted-foreground">{formatActivityDate(activity.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
