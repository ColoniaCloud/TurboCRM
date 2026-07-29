'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

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

const NO_CONTACT = '__none__'

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">{pipeline ? pipeline.name : 'Cargando…'}</p>
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-title">Título</Label>
              <Input
                id="deal-title" required
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Licencia anual — Acme"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-value">Valor</Label>
              <Input
                id="deal-value" type="number" min="0" step="0.01"
                value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="1500"
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-currency">Moneda</Label>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                <SelectTrigger id="deal-currency" className="w-24"><SelectValue>{(v: string) => v}</SelectValue></SelectTrigger>
                <SelectContent>
                  {['USD', 'UYU', 'ARS', 'CLP', 'BRL'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-contact">Contacto</Label>
              <Select value={contactId || NO_CONTACT} onValueChange={(v) => setContactId(!v || v === NO_CONTACT ? '' : v)}>
                <SelectTrigger id="deal-contact" className="w-48">
                  <SelectValue>{(v: string) => v === NO_CONTACT || !v ? 'Sin contacto' : contacts.find((c) => c.id === v)?.name ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CONTACT}>Sin contacto</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={submitting || !pipeline}>
              {submitting ? 'Agregando…' : 'Agregar deal'}
            </Button>
          </form>

          {error && (
            <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      {!pipeline || !deals ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {pipeline.stages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stageId === stage.id)

            return (
              <div key={stage.id} className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-2 rounded-full" style={{ background: stage.color }} />
                  <span>{stage.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{stageDeals.length}</span>
                </div>

                {stageDeals.map((deal) => (
                  <div key={deal.id} className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-sm">
                    <div className="font-medium">{deal.title}</div>
                    {deal.contactName && <div className="text-muted-foreground">{deal.contactName}</div>}
                    <div className="font-semibold">{formatValue(deal.value, deal.currency)}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Select value={deal.stageId} onValueChange={(v) => v && handleMove(deal.id, v)}>
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue>{(v: string) => pipeline.stages.find((s) => s.id === v)?.name ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {pipeline.stages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost" size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(deal.id)}
                      >
                        Eliminar
                      </Button>
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
