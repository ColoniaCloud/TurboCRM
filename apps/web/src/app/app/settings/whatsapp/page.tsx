'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app-context'

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
    <div className="page">
      <div className="page-header">
        <div>
          <h1>WhatsApp</h1>
          <p>Conectá el número de WhatsApp que va a usar el CRM para enviar y recibir mensajes.</p>
        </div>
      </div>

      <div className="panel">
        {error && (
          <div className="form-error" style={{ marginBottom: 'var(--spacing-4)' }}>{error}</div>
        )}

        {connected === null ? (
          <p className="empty-state">Cargando…</p>
        ) : connected ? (
          <div className="whatsapp-status">
            <span className="whatsapp-status-connected">
              <span className="whatsapp-status-dot" />
              WhatsApp conectado
            </span>
            <button type="button" className="btn-ghost" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión de WhatsApp'}
            </button>
          </div>
        ) : (
          <div className="whatsapp-status">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Código QR de WhatsApp" className="whatsapp-qr" />
            ) : (
              <p className="empty-state">Generando código QR…</p>
            )}
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: 360 }}>
              Escaneá este código desde WhatsApp en tu teléfono → Menú → Dispositivos vinculados → Vincular un dispositivo.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
