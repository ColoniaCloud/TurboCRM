'use client'

import { useEffect, useState } from 'react'
import type { ContactStatus } from '@colonia-crm/shared'
import { useApp } from '../app-context'

type TagItem = { id: string; name: string; color: string | null }

type EmailCampaign = {
  id: string
  subject: string
  body: string
  recipientCount: number
  failedCount: number
  createdAt: string
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospecto',
  client:   'Cliente',
  inactive: 'Inactivo',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function CampaignsPage() {
  const { apiFetch } = useApp()

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactStatus | ''>('')
  const [tagFilter, setTagFilter]       = useState('')
  const [allTags, setAllTags]           = useState<TagItem[]>([])

  const [sending, setSending]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<{ sent: number; failed: number } | null>(null)

  const [campaigns, setCampaigns]           = useState<EmailCampaign[] | null>(null)
  const [campaignsError, setCampaignsError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/tags')
      .then((res) => res.json())
      .then((data: { items: TagItem[] }) => setAllTags(data.items))
      .catch(() => {})
  }, [apiFetch])

  async function loadCampaigns() {
    const res  = await apiFetch('/api/email/campaigns')
    const data = await res.json() as { items: EmailCampaign[] }
    setCampaigns(data.items)
  }

  useEffect(() => {
    loadCampaigns().catch(() => setCampaignsError('No se pudieron cargar las campañas'))
  }, [apiFetch])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()
    if (!trimmedSubject || !trimmedMessage) return

    if (!window.confirm('¿Enviar este email a todos los contactos que coincidan con el filtro? Esta acción no se puede deshacer.')) {
      return
    }

    setSending(true)
    setError(null)
    setResult(null)

    try {
      const res = await apiFetch('/api/email/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          subject: trimmedSubject,
          message: trimmedMessage,
          status: statusFilter || undefined,
          tagId:  tagFilter || undefined,
        }),
      })

      const body = await res.json().catch(() => null) as
        | { status: 'ok'; item: EmailCampaign; sent: number; failed: number }
        | { status: 'error'; error: string }
        | null

      if (!res.ok || !body || body.status === 'error') {
        throw new Error(body && body.status === 'error' ? body.error : 'No se pudo enviar la campaña')
      }

      setResult({ sent: body.sent, failed: body.failed })
      setSubject('')
      setMessage('')
      await loadCampaigns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la campaña')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Campañas</h1>
          <p>Enviá un email masivo a tus contactos filtrando por estado y/o etiqueta.</p>
        </div>
      </div>

      <div className="panel">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <div className="inline-field">
            <label htmlFor="campaign-subject">Asunto</label>
            <input
              id="campaign-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del email"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="campaign-message">Mensaje</label>
            <textarea
              id="campaign-message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribí el contenido del email…"
            />
          </div>

          <div className="inline-form">
            <div className="inline-field" style={{ flex: '0 0 200px' }}>
              <label htmlFor="campaign-status-filter">Estado</label>
              <select
                id="campaign-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ContactStatus | '')}
              >
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            {allTags.length > 0 && (
              <div className="inline-field" style={{ flex: '0 0 200px' }}>
                <label htmlFor="campaign-tag-filter">Etiqueta</label>
                <select
                  id="campaign-tag-filter"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="">Todas las etiquetas</option>
                  {allTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}
          {result && (
            <p style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>
              Campaña enviada: {result.sent} enviado{result.sent === 1 ? '' : 's'}, {result.failed} fallido{result.failed === 1 ? '' : 's'}.
            </p>
          )}

          <button
            type="submit"
            className="btn"
            disabled={sending || !subject.trim() || !message.trim()}
            style={{ alignSelf: 'flex-start' }}
          >
            {sending ? 'Enviando…' : 'Enviar campaña'}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Historial</h2>

        {campaignsError && (
          <div className="form-error" style={{ marginBottom: 'var(--spacing-3)' }}>{campaignsError}</div>
        )}

        {!campaigns ? (
          <p className="empty-state">Cargando…</p>
        ) : campaigns.length === 0 ? (
          <p className="empty-state">Todavía no enviaste ninguna campaña.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asunto</th>
                  <th>Enviados</th>
                  <th>Fallidos</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.subject}</td>
                    <td>{campaign.recipientCount}</td>
                    <td>{campaign.failedCount}</td>
                    <td>{formatDate(campaign.createdAt)}</td>
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
