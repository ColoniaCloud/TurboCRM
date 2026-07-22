'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'

type Stage = { id: string; name: string; color: string; position: number }
type Pipeline = { id: string; name: string; stages: Stage[] }

type Deal = {
  id: string
  pipelineId: string
  stageId: string
  contactId: string | null
  contactName: string | null
  title: string
  value: string
  currency: string
}

type Contact = { id: string; name: string }

function formatValue(value: string, currency: string) {
  const num = Number(value)
  if (Number.isNaN(num)) return `${currency} ${value}`
  return `${currency} ${num.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
}

export default function PipelinePage() {
  const { apiFetch } = useApp()

  const [pipeline, setPipeline]     = useState<Pipeline | null>(null)
  const [deals, setDeals]           = useState<Deal[] | null>(null)
  const [contacts, setContacts]     = useState<Contact[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [title, setTitle]         = useState('')
  const [value, setValue]         = useState('')
  const [currency, setCurrency]   = useState('USD')
  const [contactId, setContactId] = useState('')

  async function loadDeals() {
    const res  = await apiFetch('/api/deals')
    const data = await res.json() as { items: Deal[] }
    setDeals(data.items)
  }

  useEffect(() => {
    async function load() {
      try {
        const [pipelinesRes, contactsRes] = await Promise.all([
          apiFetch('/api/pipelines'),
          apiFetch('/api/contacts'),
        ])
        const pipelinesData = await pipelinesRes.json() as { items: Pipeline[] }
        const contactsData  = await contactsRes.json() as { items: Contact[] }

        setPipeline(pipelinesData.items[0] ?? null)
        setContacts(contactsData.items)
        await loadDeals()
      } catch {
        setError('No se pudo cargar el pipeline')
      }
    }

    load()
  }, [apiFetch])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const firstStage = pipeline?.stages[0]
    if (!pipeline || !firstStage) return

    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          title,
          pipelineId: pipeline.id,
          stageId:    firstStage.id,
          value:      value || undefined,
          currency,
          contactId:  contactId || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el deal')
      }

      setTitle('')
      setValue('')
      setContactId('')
      await loadDeals()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el deal')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMove(dealId: string, stageId: string) {
    const previous = deals
    setDeals((prev) => prev?.map((deal) => (deal.id === dealId ? { ...deal, stageId } : deal)) ?? null)

    const res = await apiFetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      body: JSON.stringify({ stageId }),
    })

    if (!res.ok) {
      setDeals(previous ?? null)
    }
  }

  async function handleDelete(dealId: string) {
    await apiFetch(`/api/deals/${dealId}`, { method: 'DELETE' })
    setDeals((prev) => prev?.filter((deal) => deal.id !== dealId) ?? null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Pipeline</h1>
          <p>{pipeline ? pipeline.name : 'Cargando…'}</p>
        </div>
      </div>

      <div className="panel">
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="inline-field">
            <label htmlFor="deal-title">Título</label>
            <input
              id="deal-title" required
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Licencia anual — Acme"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="deal-value">Valor</label>
            <input
              id="deal-value" type="number" min="0" step="0.01"
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="1500"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="deal-currency">Moneda</label>
            <select id="deal-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="ARS">ARS</option>
              <option value="CLP">CLP</option>
              <option value="BRL">BRL</option>
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="deal-contact">Contacto</label>
            <select id="deal-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Sin contacto</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn" disabled={submitting || !pipeline}>
            {submitting ? 'Agregando…' : 'Agregar deal'}
          </button>
        </form>

        {error && (
          <div className="form-error" style={{ marginTop: 'var(--spacing-4)' }}>{error}</div>
        )}
      </div>

      {!pipeline || !deals ? (
        <p className="empty-state">Cargando…</p>
      ) : (
        <div className="kanban">
          {pipeline.stages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stageId === stage.id)

            return (
              <div key={stage.id} className="kanban-column">
                <div className="kanban-column-header">
                  <span className="kanban-dot" style={{ background: stage.color }} />
                  <span>{stage.name}</span>
                  <span className="kanban-count">{stageDeals.length}</span>
                </div>

                {stageDeals.map((deal) => (
                  <div key={deal.id} className="deal-card">
                    <div className="title">{deal.title}</div>
                    {deal.contactName && <div className="contact">{deal.contactName}</div>}
                    <div className="value">{formatValue(deal.value, deal.currency)}</div>
                    <div className="deal-card-actions">
                      <select value={deal.stageId} onChange={(e) => handleMove(deal.id, e.target.value)}>
                        {pipeline.stages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <button className="link-danger" onClick={() => handleDelete(deal.id)}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
