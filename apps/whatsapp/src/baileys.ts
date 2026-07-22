import { rm } from 'node:fs/promises'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, type WASocket } from 'baileys'
import { pino } from 'pino'
import qrcode from 'qrcode'

const SESSION_PATH        = process.env.WHATSAPP_SESSION_PATH ?? './whatsapp-sessions'
const API_INTERNAL_URL    = process.env.API_INTERNAL_URL ?? 'http://localhost:3001'
const WHATSAPP_INTERNAL_SECRET = process.env.WHATSAPP_INTERNAL_SECRET

const logger = pino({ level: 'warn' })

type Status = {
  connected: boolean
  qrDataUrl: string | null
}

const MAX_RECONNECT_ATTEMPTS = 10

let sock: WASocket | null = null
let currentQrDataUrl: string | null = null
let connected = false
let reconnectAttempts = 0

export function getStatus(): Status {
  return { connected, qrDataUrl: connected ? null : currentQrDataUrl }
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

function jidToPhone(jid: string): string {
  return jid.split('@')[0]?.split(':')[0] ?? jid
}

async function notifyIncoming(phone: string, message: string) {
  try {
    await fetch(`${API_INTERNAL_URL}/internal/whatsapp/incoming`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WHATSAPP_INTERNAL_SECRET ? { 'x-internal-secret': WHATSAPP_INTERNAL_SECRET } : {}),
      },
      body: JSON.stringify({ phone, message }),
    })
  } catch (err) {
    logger.error({ err }, 'No se pudo notificar el mensaje entrante a la API')
  }
}

export async function startSocket(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH)

  // La versión de protocolo que trae Baileys por default queda desactualizada
  // rápido y WhatsApp rechaza la conexión (statusCode 405) si no coincide con
  // la vigente — se pide en runtime en vez de confiar en la constante embebida.
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    auth: state,
    logger,
    version,
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      currentQrDataUrl = await qrcode.toDataURL(qr)
    }

    if (connection === 'open') {
      connected = true
      currentQrDataUrl = null
      reconnectAttempts = 0
      logger.info('WhatsApp conectado')
    }

    if (connection === 'close') {
      connected = false

      // El error de desconexión trae un status code HTTP-like (Boom) que
      // indica la razón. Dos casos terminales que NO se resuelven
      // reintentando: logout explícito (401) y sesión inválida/corrupta
      // (500, badSession) — en ambos, las credenciales guardadas ya no
      // sirven; se limpian y se arranca de cero para generar un QR nuevo.
      // Reintentar con credenciales muertas producía un loop caliente de
      // varios reintentos por segundo contra WhatsApp (visto en vivo).
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode
      const sessionDead = statusCode === DisconnectReason.loggedOut
        || statusCode === DisconnectReason.badSession

      if (sessionDead) {
        currentQrDataUrl = null
        logger.warn({ statusCode }, 'Sesión de WhatsApp inválida — se limpian las credenciales guardadas')
        await rm(SESSION_PATH, { recursive: true, force: true })
      }

      // Backoff exponencial SIEMPRE — incluso tras limpiar la sesión.
      // WhatsApp puede seguir rechazando conexiones un rato (bloqueo
      // temporal tras una ráfaga de reintentos); reconectar sin pausa en
      // ese estado solo alarga el bloqueo. Pasado el máximo de intentos,
      // el servicio queda a la espera de un "Cerrar sesión" manual desde
      // Configuración (que resetea el contador via logout()).
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++
        const delayMs = Math.min(60_000, 2000 * 2 ** reconnectAttempts)
        logger.warn({ statusCode, attempt: reconnectAttempts, delayMs }, 'Conexión de WhatsApp perdida, reintentando…')
        setTimeout(() => { void startSocket() }, delayMs)
      } else {
        logger.error('Demasiados reintentos de conexión de WhatsApp — usá "Cerrar sesión de WhatsApp" en Configuración para reiniciar desde cero')
      }
    }
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue

      const jid = msg.key.remoteJid
      // Lista blanca, no negra: solo chats 1:1 reales (@s.whatsapp.net).
      // Excluye grupos (@g.us), estados/broadcast (@broadcast), canales de
      // difusión y JIDs de "linked ID" (@lid) — cualquiera de esos generaba
      // leads basura con IDs que no son teléfonos reales.
      if (!jid || !jid.endsWith('@s.whatsapp.net')) continue

      const text = msg.message?.conversation
        ?? msg.message?.extendedTextMessage?.text
        ?? msg.message?.imageMessage?.caption
        ?? null

      if (!text) continue

      void notifyIncoming(jidToPhone(jid), text)
    }
  })
}

export async function sendMessage(phone: string, message: string): Promise<void> {
  if (!sock || !connected) {
    throw new Error('WhatsApp no está conectado')
  }

  const jid = `${normalizePhone(phone)}@s.whatsapp.net`
  await sock.sendMessage(jid, { text: message })
}

export async function logout(): Promise<void> {
  if (sock) {
    try {
      await sock.logout()
    } catch {
      // Ya estaba desconectado — no es un error real.
    }
  }

  connected = false
  currentQrDataUrl = null
  reconnectAttempts = 0

  await rm(SESSION_PATH, { recursive: true, force: true })
  await startSocket()
}
