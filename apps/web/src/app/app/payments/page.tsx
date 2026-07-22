'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PaymentStatus, PaymentRecurrence } from '@colonia-crm/shared'
import { useApp } from '../app-context'

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

const RECURRENCE_LABELS: Record<PaymentRecurrence, string> = {
  none:    '—',
  monthly: 'Mensual',
  annual:  'Anual',
}

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
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Cobros</h1>
          <p>Calendario de pagos con recordatorios automáticos.</p>
        </div>
      </div>

      <div className="panel">
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="inline-field">
            <label htmlFor="payment-contact">Contacto</label>
            <select
              id="payment-contact" required
              value={contactId} onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.name}</option>
              ))}
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="payment-description">Descripción</label>
            <input
              id="payment-description" required
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Seña - Sitio esencial"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="payment-amount">Monto</label>
            <input
              id="payment-amount" type="number" min="0" step="0.01" required
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="125.00"
            />
          </div>
          <div className="inline-field">
            <label htmlFor="payment-currency">Moneda</label>
            <select id="payment-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
              <option value="ARS">ARS</option>
              <option value="CLP">CLP</option>
              <option value="BRL">BRL</option>
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="payment-due-date">Vencimiento</label>
            <input
              id="payment-due-date" type="date" required
              value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="inline-field">
            <label htmlFor="payment-recurrence">Recurrencia</label>
            <select
              id="payment-recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as PaymentRecurrence)}
            >
              <option value="none">Ninguna</option>
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          <div className="inline-field">
            <label htmlFor="payment-reminder-days">Avisar con cuántos días de anticipación</label>
            <input
              id="payment-reminder-days" type="number" min="0" step="1"
              value={reminderDaysBefore} onChange={(e) => setReminderDaysBefore(e.target.value)}
              placeholder="3"
            />
          </div>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Agregando…' : 'Agregar cobro'}
          </button>
        </form>

        {error && (
          <div className="form-error" style={{ marginTop: 'var(--spacing-4)' }}>{error}</div>
        )}
      </div>

      <div className="panel">
        <div className="inline-form" style={{ marginBottom: 'var(--spacing-4)' }}>
          <div className="inline-field" style={{ flex: '0 0 160px' }}>
            <label htmlFor="payment-status-filter">Estado</label>
            <select
              id="payment-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="overdue">Vencido</option>
              <option value="paid">Pagado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>

        {!payments ? (
          <p className="empty-state">Cargando…</p>
        ) : payments.length === 0 ? (
          <p className="empty-state">Todavía no agregaste ningún cobro.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Descripción</th>
                  <th>Monto</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th>Recurrencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.contactName ? (
                        <Link href={`/app/contacts/${payment.contactId}`}>{payment.contactName}</Link>
                      ) : '—'}
                    </td>
                    <td>{payment.description}</td>
                    <td>{formatAmount(payment.amount, payment.currency)}</td>
                    <td>{formatDueDate(payment.dueDate)}</td>
                    <td><span className={`pill pill-${payment.status}`}>{STATUS_LABELS[payment.status]}</span></td>
                    <td>{RECURRENCE_LABELS[payment.recurrence]}</td>
                    <td style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                      {payment.status !== 'paid' && payment.status !== 'cancelled' && (
                        <button className="btn-ghost" onClick={() => handleMarkPaid(payment.id)}>Marcar pagado</button>
                      )}
                      <button className="link-danger" onClick={() => handleDelete(payment.id)}>Eliminar</button>
                    </td>
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
