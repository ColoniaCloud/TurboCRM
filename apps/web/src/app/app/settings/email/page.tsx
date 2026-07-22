'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app-context'

type EmailStatus = {
  status: 'ok'
  configured: boolean
  lastPollAt: string | null
  lastPollError: string | null
}

const POLL_MS = 15_000

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function EmailSettingsPage() {
  const { apiFetch } = useApp()

  const [data, setData]   = useState<EmailStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  async function poll() {
    try {
      const res = await apiFetch('/api/email/status')
      if (!res.ok) throw new Error('No se pudo consultar el estado del email')

      const body = await res.json() as EmailStatus
      if (cancelledRef.current) return

      setError(null)
      setData(body)
      timeoutRef.current = setTimeout(poll, POLL_MS)
    } catch {
      if (cancelledRef.current) return
      setError('No se pudo consultar el estado del email')
      timeoutRef.current = setTimeout(poll, POLL_MS)
    }
  }

  useEffect(() => {
    cancelledRef.current = false
    poll()

    return () => {
      cancelledRef.current = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Email</h1>
          <p>Estado de la conexión IMAP/SMTP que usa el CRM para enviar y recibir correos.</p>
        </div>
      </div>

      <div className="panel">
        {error && (
          <div className="form-error" style={{ marginBottom: 'var(--spacing-4)' }}>{error}</div>
        )}

        {!data ? (
          <p className="empty-state">Cargando…</p>
        ) : !data.configured ? (
          <p className="empty-state">
            El email todavía no está configurado — completá las variables EMAIL_IMAP_HOST, EMAIL_SMTP_HOST,
            EMAIL_USER y EMAIL_PASSWORD en el .env del servidor.
          </p>
        ) : (
          <div className="whatsapp-status">
            <span className="whatsapp-status-connected">
              <span className="whatsapp-status-dot" />
              Conectado
            </span>
            {data.lastPollAt && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Última revisión del inbox: {formatDate(data.lastPollAt)}
              </p>
            )}
            {data.lastPollError && (
              <div className="form-error">{data.lastPollError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
