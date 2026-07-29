'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app-context'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Estado de la conexión IMAP/SMTP que usa el CRM para enviar y recibir correos.
      </p>

      <Card>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>
          )}

          {!data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : !data.configured ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              El email todavía no está configurado — completá las variables EMAIL_IMAP_HOST, EMAIL_SMTP_HOST,
              EMAIL_USER y EMAIL_PASSWORD en el .env del servidor.
            </p>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="size-2 rounded-full bg-primary" />
                Conectado
              </span>
              {data.lastPollAt && (
                <p className="text-sm text-muted-foreground">
                  Última revisión del inbox: {formatDate(data.lastPollAt)}
                </p>
              )}
              {data.lastPollError && (
                <Alert variant="destructive"><AlertDescription>{data.lastPollError}</AlertDescription></Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
