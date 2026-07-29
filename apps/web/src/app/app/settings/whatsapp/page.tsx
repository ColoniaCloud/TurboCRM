'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type WhatsAppStatus = {
  status: 'ok'
  connected: boolean
  qrDataUrl: string | null
}

const POLL_CONNECTED_MS    = 10_000
const POLL_DISCONNECTED_MS = 3_000

export default function WhatsAppSettingsPage() {
  const { apiFetch } = useApp()

  const [connected, setConnected]   = useState<boolean | null>(null)
  const [qrDataUrl, setQrDataUrl]   = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)

  async function poll() {
    try {
      const res  = await apiFetch('/api/whatsapp/status')
      if (!res.ok) throw new Error('No se pudo conectar con el servicio de WhatsApp')

      const data = await res.json() as WhatsAppStatus

      if (cancelledRef.current) return

      setError(null)
      setConnected(data.connected)
      setQrDataUrl(data.qrDataUrl)

      timeoutRef.current = setTimeout(poll, data.connected ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS)
    } catch {
      if (cancelledRef.current) return
      setError('No se pudo conectar con el servicio de WhatsApp — verificá que esté corriendo')
      timeoutRef.current = setTimeout(poll, POLL_DISCONNECTED_MS)
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

  async function handleLogout() {
    setLoggingOut(true)
    setError(null)

    try {
      const res = await apiFetch('/api/whatsapp/logout', { method: 'POST' })
      if (!res.ok) throw new Error('No se pudo cerrar la sesión de WhatsApp')

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      await poll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la sesión de WhatsApp')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Conectá el número de WhatsApp que va a usar el CRM para enviar y recibir mensajes.
      </p>

      <Card>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>
          )}

          {connected === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : connected ? (
            <div className="flex flex-col items-start gap-4">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="size-2 rounded-full bg-primary" />
                WhatsApp conectado
              </span>
              <Button type="button" variant="outline" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión de WhatsApp'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="Código QR de WhatsApp" className="size-56 rounded-lg border" />
              ) : (
                <p className="py-6 text-sm text-muted-foreground">Generando código QR…</p>
              )}
              <p className="max-w-90 text-sm text-muted-foreground">
                Escaneá este código desde WhatsApp en tu teléfono → Menú → Dispositivos vinculados → Vincular un dispositivo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
