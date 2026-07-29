'use client'

import { useEffect, useState } from 'react'
import type { ContactStatus } from '@colonia-crm/shared'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

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

const ALL_STATUS = '__all_status__'
const ALL_TAGS = '__all_tags__'

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Campañas</h1>
        <p className="text-sm text-muted-foreground">Enviá un email masivo a tus contactos filtrando por estado y/o etiqueta.</p>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign-subject">Asunto</Label>
              <Input
                id="campaign-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto del email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign-message">Mensaje</Label>
              <Textarea
                id="campaign-message"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribí el contenido del email…"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex w-52 flex-col gap-1.5">
                <Label htmlFor="campaign-status-filter">Estado</Label>
                <Select value={statusFilter || ALL_STATUS} onValueChange={(v) => setStatusFilter(!v || v === ALL_STATUS ? '' : v as ContactStatus)}>
                  <SelectTrigger id="campaign-status-filter" className="w-full">
                    <SelectValue>{(v: string) => v === ALL_STATUS || !v ? 'Todos los estados' : STATUS_LABELS[v as ContactStatus]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUS}>Todos los estados</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {allTags.length > 0 && (
                <div className="flex w-52 flex-col gap-1.5">
                  <Label htmlFor="campaign-tag-filter">Etiqueta</Label>
                  <Select value={tagFilter || ALL_TAGS} onValueChange={(v) => setTagFilter(!v || v === ALL_TAGS ? '' : v)}>
                    <SelectTrigger id="campaign-tag-filter" className="w-full">
                      <SelectValue>{(v: string) => v === ALL_TAGS || !v ? 'Todas las etiquetas' : allTags.find((t) => t.id === v)?.name ?? v}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_TAGS}>Todas las etiquetas</SelectItem>
                      {allTags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {result && (
              <p className="text-sm text-primary-foreground">
                Campaña enviada: {result.sent} enviado{result.sent === 1 ? '' : 's'}, {result.failed} fallido{result.failed === 1 ? '' : 's'}.
              </p>
            )}

            <Button
              type="submit"
              className="self-start"
              disabled={sending || !subject.trim() || !message.trim()}
            >
              {sending ? 'Enviando…' : 'Enviar campaña'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-semibold">Historial</h2>

          {campaignsError && (
            <Alert variant="destructive" className="mb-3"><AlertDescription>{campaignsError}</AlertDescription></Alert>
          )}

          {!campaigns ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : campaigns.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Todavía no enviaste ninguna campaña.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asunto</TableHead>
                    <TableHead>Enviados</TableHead>
                    <TableHead>Fallidos</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>{campaign.subject}</TableCell>
                      <TableCell>{campaign.recipientCount}</TableCell>
                      <TableCell>{campaign.failedCount}</TableCell>
                      <TableCell>{formatDate(campaign.createdAt)}</TableCell>
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
