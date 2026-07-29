'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PaymentStatus, PaymentRecurrence } from '@colonia-crm/shared'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type Payment = {
  id: string
  contactId: string
  contactName: string | null
  description: string
  amount: string
  currency: 'USD' | 'UYU' | 'ARS' | 'CLP' | 'BRL'
  dueDate: string
  status: PaymentStatus
  recurrence: PaymentRecurrence
  reminderDaysBefore: number
  paidAt: string | null
  createdAt: string
}

type Contact = { id: string; name: string }

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending:   'Pendiente',
  overdue:   'Vencido',
  paid:      'Pagado',
  cancelled: 'Cancelado',
}

const STATUS_BADGE_CLASS: Record<PaymentStatus, string> = {
  pending:   'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  overdue:   'border-transparent bg-destructive/10 text-destructive',
  paid:      'border-transparent bg-primary/15 text-primary-foreground dark:text-primary',
  cancelled: 'border-transparent bg-muted text-muted-foreground',
}

const RECURRENCE_LABELS: Record<PaymentRecurrence, string> = {
  none:    '—',
  monthly: 'Mensual',
  annual:  'Anual',
}

const ALL_STATUS = '__all__'

function formatAmount(amount: string, currency: string) {
  const num = Number(amount)
  if (Number.isNaN(num)) return `${currency} ${amount}`
  return `${currency} ${num.toLocaleString('es-UY')}`
}

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PaymentsPage() {
  const { apiFetch } = useApp()

  const [payments, setPayments]     = useState<Payment[] | null>(null)
  const [contacts, setContacts]     = useState<Contact[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [contactId, setContactId]               = useState('')
  const [description, setDescription]           = useState('')
  const [amount, setAmount]                     = useState('')
  const [currency, setCurrency]                 = useState('USD')
  const [dueDate, setDueDate]                   = useState('')
  const [recurrence, setRecurrence]             = useState<PaymentRecurrence>('none')
  const [reminderDaysBefore, setReminderDaysBefore] = useState('3')

  const [statusFilter, setStatusFilter] = useState('')

  async function loadPayments() {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    const qs  = params.toString()
    const res = await apiFetch(`/api/payments${qs ? `?${qs}` : ''}`)
    const data = await res.json() as { items: Payment[] }
    setPayments(data.items)
  }

  useEffect(() => {
    apiFetch('/api/contacts?pageSize=200')
      .then((res) => res.json())
      .then((data: { items: Contact[] }) => setContacts(data.items))
      .catch(() => {})
  }, [apiFetch])

  useEffect(() => {
    loadPayments().catch(() => setError('No se pudieron cargar los cobros'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, statusFilter])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          contactId,
          description,
          amount,
          currency,
          dueDate: new Date(dueDate).toISOString(),
          recurrence,
          reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear el cobro')
      }

      setContactId('')
      setDescription('')
      setAmount('')
      setCurrency('USD')
      setDueDate('')
      setRecurrence('none')
      setReminderDaysBefore('3')
      await loadPayments()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el cobro')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkPaid(id: string) {
    await apiFetch(`/api/payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid' }),
    })
    await loadPayments()
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/payments/${id}`, { method: 'DELETE' })
    await loadPayments()
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Cobros</h1>
        <p className="text-sm text-muted-foreground">Calendario de pagos con recordatorios automáticos.</p>
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-contact">Contacto</Label>
              <Select value={contactId} onValueChange={(v) => v && setContactId(v)}>
                <SelectTrigger id="payment-contact" className="w-48">
                  <SelectValue>{(v: string) => contacts.find((c) => c.id === v)?.name ?? 'Seleccionar…'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-description">Descripción</Label>
              <Input
                id="payment-description" required
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Seña - Sitio esencial"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount">Monto</Label>
              <Input
                id="payment-amount" type="number" min="0" step="0.01" required
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="125.00"
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-currency">Moneda</Label>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                <SelectTrigger id="payment-currency" className="w-24"><SelectValue>{(v: string) => v}</SelectValue></SelectTrigger>
                <SelectContent>
                  {['USD', 'UYU', 'ARS', 'CLP', 'BRL'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-due-date">Vencimiento</Label>
              <Input
                id="payment-due-date" type="date" required
                value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-recurrence">Recurrencia</Label>
              <Select value={recurrence} onValueChange={(v) => v && setRecurrence(v as PaymentRecurrence)}>
                <SelectTrigger id="payment-recurrence" className="w-32">
                  <SelectValue>{(v: string) => RECURRENCE_LABELS[v as PaymentRecurrence] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguna</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-reminder-days">Avisar con cuántos días de anticipación</Label>
              <Input
                id="payment-reminder-days" type="number" min="0" step="1"
                value={reminderDaysBefore} onChange={(e) => setReminderDaysBefore(e.target.value)}
                placeholder="3"
                className="w-20"
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Agregando…' : 'Agregar cobro'}
            </Button>
          </form>

          {error && (
            <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="mb-4 flex flex-col gap-1.5">
            <Label htmlFor="payment-status-filter">Estado</Label>
            <Select value={statusFilter || ALL_STATUS} onValueChange={(v) => setStatusFilter(!v || v === ALL_STATUS ? '' : v)}>
              <SelectTrigger id="payment-status-filter" className="w-44">
                <SelectValue>{(v: string) => v === ALL_STATUS || !v ? 'Todos' : STATUS_LABELS[v as PaymentStatus]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>Todos</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!payments ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : payments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Todavía no agregaste ningún cobro.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Recurrencia</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {payment.contactName ? (
                          <Link href={`/app/contacts/${payment.contactId}`} className="hover:underline">{payment.contactName}</Link>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{payment.description}</TableCell>
                      <TableCell>{formatAmount(payment.amount, payment.currency)}</TableCell>
                      <TableCell>{formatDueDate(payment.dueDate)}</TableCell>
                      <TableCell><Badge className={STATUS_BADGE_CLASS[payment.status]}>{STATUS_LABELS[payment.status]}</Badge></TableCell>
                      <TableCell>{RECURRENCE_LABELS[payment.recurrence]}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {payment.status !== 'paid' && payment.status !== 'cancelled' && (
                            <Button variant="outline" size="sm" onClick={() => handleMarkPaid(payment.id)}>Marcar pagado</Button>
                          )}
                          <Button
                            variant="ghost" size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(payment.id)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
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
