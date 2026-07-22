'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ContactStatus } from '@colonia-crm/shared'
import { useApp } from '../app-context'

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Contactos</h1>
          <p>Leads, prospectos y clientes.</p>
        </div>
        <Link href="/app/contacts/import" className="btn-ghost">Importar CSV</Link>
      </div>

      <div className="panel">
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="inline-field">
            <label htmlFor="contact-name">Nombre</label>
            <input
              id="contact-name" required
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="María Fernández"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="contact-email">Email</label>
            <input
              id="contact-email" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@empresa.com"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="contact-phone">Teléfono</label>
            <input
              id="contact-phone"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+598 99 123 456"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="contact-company">Empresa</label>
            <input
              id="contact-company"
              value={company} onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme SRL"
            />
          </div>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Agregando…' : 'Agregar contacto'}
          </button>
        </form>

        {error && (
          <div className="form-error" style={{ marginTop: 'var(--spacing-4)' }}>{error}</div>
        )}
      </div>

      <div className="panel">
        <div className="inline-form" style={{ marginBottom: 'var(--spacing-4)' }}>
          <div className="inline-field">
            <label htmlFor="contact-search">Buscar</label>
            <input
              id="contact-search"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nombre, email o empresa"
            />
          </div>
          <div className="inline-field" style={{ flex: '0 0 160px' }}>
            <label htmlFor="contact-status-filter">Estado</label>
            <select
              id="contact-status-filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="inline-field" style={{ flex: '0 0 160px' }}>
            <label htmlFor="contact-sort">Orden</label>
            <select
              id="contact-sort"
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1) }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {allTags.length > 0 && (
            <div className="inline-field" style={{ flex: '0 0 160px' }}>
              <label htmlFor="contact-tag-filter">Etiqueta</label>
              <select
                id="contact-tag-filter"
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value); setPage(1) }}
              >
                <option value="">Todas</option>
                {allTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!contacts ? (
          <p className="empty-state">Cargando…</p>
        ) : contacts.length === 0 ? (
          <p className="empty-state">
            {search || statusFilter ? 'Ningún contacto coincide con el filtro.' : 'Todavía no agregaste ningún contacto.'}
          </p>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="bulk-toolbar">
                <span className="bulk-toolbar-count">
                  {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
                </span>
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ContactStatus | '')}>
                  <option value="">Cambiar estado a…</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button className="btn-ghost" disabled={!bulkStatus || bulkBusy} onClick={handleBulkStatus}>
                  Aplicar
                </button>

                {allTags.length > 0 && (
                  <>
                    <select value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)}>
                      <option value="">Agregar etiqueta…</option>
                      {allTags.map((tag) => (
                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                    <button className="btn-ghost" disabled={!bulkTagId || bulkBusy} onClick={handleBulkAddTag}>
                      Agregar
                    </button>
                  </>
                )}

                <button className="link-danger" disabled={bulkBusy} onClick={handleBulkDelete}>
                  Eliminar seleccionados
                </button>
              </div>
            )}

            {bulkError && (
              <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{bulkError}</div>
            )}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '2rem' }}>
                      <input
                        type="checkbox"
                        checked={contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Nombre</th>
                    <th>Empresa</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                    <th>Etiquetas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                        />
                      </td>
                      <td><Link href={`/app/contacts/${contact.id}`}>{contact.name}</Link></td>
                      <td>{contact.companyName ?? '—'}</td>
                      <td>{contact.email ?? '—'}</td>
                      <td>{contact.phone ?? '—'}</td>
                      <td><span className={`pill pill-${contact.status}`}>{STATUS_LABELS[contact.status]}</span></td>
                      <td>
                        {contact.tags.length > 0 && (
                          <div className="tag-chip-row">
                            {contact.tags.map((tag) => (
                              <span key={tag.id} className="tag-chip">{tag.name}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <button className="link-danger" onClick={() => handleDelete(contact.id)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-4)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  Página {page} de {totalPages} — {total} contactos
                </span>
                <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                  <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
