'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ContactStatus } from '@colonia-crm/shared'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'

type TagItem = { id: string; name: string; color: string | null }

type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  status: ContactStatus
  tags: TagItem[]
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospecto',
  client:   'Cliente',
  inactive: 'Inactivo',
}

const STATUS_BADGE_CLASS: Record<ContactStatus, string> = {
  lead:     'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  prospect: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  client:   'border-transparent bg-primary/15 text-primary-foreground dark:text-primary',
  inactive: 'border-transparent bg-muted text-muted-foreground',
}

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Más recientes' },
  { value: 'createdAt_asc',  label: 'Más antiguos' },
  { value: 'name_asc',       label: 'Nombre A-Z' },
  { value: 'name_desc',      label: 'Nombre Z-A' },
]

const PAGE_SIZE = 50

export default function ContactsPage() {
  const { apiFetch } = useApp()

  const [contacts, setContacts]   = useState<Contact[] | null>(null)
  const [total, setTotal]         = useState(0)
  const [error, setError]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [company, setCompany] = useState('')

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tagFilter, setTagFilter]     = useState('')
  const [allTags, setAllTags]         = useState<TagItem[]>([])
  const [sort, setSort]               = useState('createdAt_desc')
  const [page, setPage]               = useState(1)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus]   = useState<ContactStatus | ''>('')
  const [bulkTagId, setBulkTagId]     = useState('')
  const [bulkBusy, setBulkBusy]       = useState(false)
  const [bulkError, setBulkError]     = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/tags')
      .then((res) => res.json())
      .then((data: { items: TagItem[] }) => setAllTags(data.items))
      .catch(() => {})
  }, [apiFetch])

  // Debounce del buscador: espera a que el usuario deje de tipear.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  async function loadContacts() {
    const params = new URLSearchParams({
      sort,
      page:     String(page),
      pageSize: String(PAGE_SIZE),
    })
    if (search)       params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    if (tagFilter)    params.set('tagId', tagFilter)

    const res  = await apiFetch(`/api/contacts?${params.toString()}`)
    const data = await res.json() as { items: Contact[]; total: number }
    setContacts(data.items)
    setTotal(data.total)
    setSelectedIds(new Set())
  }

  useEffect(() => {
    loadContacts().catch(() => setError('No se pudieron cargar los contactos'))
  }, [apiFetch, search, statusFilter, tagFilter, sort, page])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email:       email || undefined,
          phone:       phone || undefined,
          companyName: company || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el contacto')
      }

      setName('')
      setEmail('')
      setPhone('')
      setCompany('')
      await loadContacts()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el contacto')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
    await loadContacts()
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!contacts) return
    setSelectedIds((prev) => {
      const allSelected = contacts.length > 0 && contacts.every((c) => prev.has(c.id))
      return allSelected ? new Set() : new Set(contacts.map((c) => c.id))
    })
  }

  async function handleBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const res = await apiFetch('/api/contacts/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: Array.from(selectedIds), status: bulkStatus }),
      })
      if (!res.ok) throw new Error('No se pudo cambiar el estado de los contactos seleccionados')
      setBulkStatus('')
      await loadContacts()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkAddTag() {
    if (!bulkTagId || selectedIds.size === 0) return
    setBulkBusy(true)
    setBulkError(null)
    try {
      const res = await apiFetch('/api/contacts/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: Array.from(selectedIds), addTagId: bulkTagId }),
      })
      if (!res.ok) throw new Error('No se pudo agregar la etiqueta a los contactos seleccionados')
      setBulkTagId('')
      await loadContacts()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'No se pudo agregar la etiqueta')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!window.confirm(`¿Eliminar ${selectedIds.size} contacto(s)? Esta acción no se puede deshacer.`)) return

    setBulkBusy(true)
    setBulkError(null)
    try {
      const res = await apiFetch('/api/contacts/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) throw new Error('No se pudieron eliminar los contactos seleccionados')
      await loadContacts()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'No se pudieron eliminar los contactos')
    } finally {
      setBulkBusy(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allSelected = !!contacts && contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Contactos</h1>
          <p className="text-sm text-muted-foreground">Leads, prospectos y clientes.</p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/app/contacts/import">Importar CSV</Link>} />
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-name">Nombre</Label>
              <Input
                id="contact-name" required
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="María Fernández"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email" type="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@empresa.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-phone">Teléfono</Label>
              <Input
                id="contact-phone"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+598 99 123 456"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-company">Empresa</Label>
              <Input
                id="contact-company"
                value={company} onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme SRL"
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Agregando…' : 'Agregar contacto'}
            </Button>
          </form>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor="contact-search">Buscar</Label>
              <Input
                id="contact-search"
                value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nombre, email o empresa"
              />
            </div>
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="contact-status-filter">Estado</Label>
              <Select
                value={statusFilter || 'all'}
                onValueChange={(value) => { setStatusFilter(!value || value === 'all' ? '' : value); setPage(1) }}
              >
                <SelectTrigger id="contact-status-filter" className="w-full">
                  <SelectValue>{(value: string) => value === 'all' || !value ? 'Todos' : STATUS_LABELS[value as ContactStatus]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="contact-sort">Orden</Label>
              <Select value={sort} onValueChange={(value) => { if (value) { setSort(value); setPage(1) } }}>
                <SelectTrigger id="contact-sort" className="w-full">
                  <SelectValue>{(value: string) => SORT_OPTIONS.find((o) => o.value === value)?.label ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {allTags.length > 0 && (
              <div className="flex w-40 flex-col gap-1.5">
                <Label htmlFor="contact-tag-filter">Etiqueta</Label>
                <Select
                  value={tagFilter || 'all'}
                  onValueChange={(value) => { setTagFilter(!value || value === 'all' ? '' : value); setPage(1) }}
                >
                  <SelectTrigger id="contact-tag-filter" className="w-full">
                    <SelectValue>{(value: string) => value === 'all' || !value ? 'Todas' : allTags.find((t) => t.id === value)?.name ?? value}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {allTags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!contacts ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : contacts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search || statusFilter ? 'Ningún contacto coincide con el filtro.' : 'Todavía no agregaste ningún contacto.'}
            </p>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
                  <span className="text-sm font-medium">
                    {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
                  </span>
                  <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value as ContactStatus)}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Cambiar estado a…">
                        {(value: string) => value ? STATUS_LABELS[value as ContactStatus] : 'Cambiar estado a…'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" disabled={!bulkStatus || bulkBusy} onClick={handleBulkStatus}>
                    Aplicar
                  </Button>

                  {allTags.length > 0 && (
                    <>
                      <Select value={bulkTagId} onValueChange={(value) => setBulkTagId(value ?? '')}>
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Agregar etiqueta…">
                            {(value: string) => value ? allTags.find((t) => t.id === value)?.name ?? value : 'Agregar etiqueta…'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {allTags.map((tag) => (
                            <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" disabled={!bulkTagId || bulkBusy} onClick={handleBulkAddTag}>
                        Agregar
                      </Button>
                    </>
                  )}

                  <Button
                    variant="ghost" size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={bulkBusy}
                    onClick={handleBulkDelete}
                  >
                    Eliminar seleccionados
                  </Button>
                </div>
              )}

              {bulkError && (
                <Alert variant="destructive" className="mb-3">
                  <AlertDescription>{bulkError}</AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                      </TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Etiquetas</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(contact.id)}
                            onCheckedChange={() => toggleSelect(contact.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link href={`/app/contacts/${contact.id}`} className="font-medium hover:underline">
                            {contact.name}
                          </Link>
                        </TableCell>
                        <TableCell>{contact.companyName ?? '—'}</TableCell>
                        <TableCell>{contact.email ?? '—'}</TableCell>
                        <TableCell>{contact.phone ?? '—'}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_BADGE_CLASS[contact.status]}>{STATUS_LABELS[contact.status]}</Badge>
                        </TableCell>
                        <TableCell>
                          {contact.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {contact.tags.map((tag) => (
                                <Badge key={tag.id} variant="secondary">{tag.name}</Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(contact.id)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages} — {total} contactos
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
