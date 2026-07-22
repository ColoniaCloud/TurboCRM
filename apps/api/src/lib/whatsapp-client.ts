const WHATSAPP_SERVICE_URL     = process.env.WHATSAPP_SERVICE_URL ?? 'http://localhost:3002'
const WHATSAPP_INTERNAL_SECRET = process.env.WHATSAPP_INTERNAL_SECRET

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(WHATSAPP_INTERNAL_SECRET ? { 'x-internal-secret': WHATSAPP_INTERNAL_SECRET } : {}),
  }
}

export async function getWhatsAppStatus(): Promise<{ connected: boolean; qrDataUrl: string | null }> {
  const res = await fetch(`${WHATSAPP_SERVICE_URL}/status`, { headers: headers() })
  if (!res.ok) throw new Error('No se pudo consultar el estado de WhatsApp')
  return res.json() as Promise<{ connected: boolean; qrDataUrl: string | null }>
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const res = await fetch(`${WHATSAPP_SERVICE_URL}/send`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ phone, message }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? 'No se pudo enviar el mensaje de WhatsApp')
  }
}

export async function logoutWhatsApp(): Promise<void> {
  const res = await fetch(`${WHATSAPP_SERVICE_URL}/logout`, { method: 'POST', headers: headers() })
  if (!res.ok) throw new Error('No se pudo cerrar la sesión de WhatsApp')
}
