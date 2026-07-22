import { readFile, writeFile } from 'node:fs/promises'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import { isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { contacts } from '../db/schema'
import { logActivity } from '../contacts/activity-log'

const POLL_STATE_PATH = process.env.EMAIL_POLL_STATE_PATH ?? './email-poll-state.json'

const IMAP_HOST = process.env.EMAIL_IMAP_HOST
const IMAP_PORT = Number(process.env.EMAIL_IMAP_PORT) || 993
const SMTP_HOST = process.env.EMAIL_SMTP_HOST
const SMTP_PORT = Number(process.env.EMAIL_SMTP_PORT) || 465
const EMAIL_USER = process.env.EMAIL_USER
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD

export function isEmailConfigured(): boolean {
  return Boolean(IMAP_HOST && SMTP_HOST && EMAIL_USER && EMAIL_PASSWORD)
}

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!SMTP_HOST || !EMAIL_USER || !EMAIL_PASSWORD) {
    throw new Error('Email no está configurado — faltan variables EMAIL_* en .env')
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth:   { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    })
  }
  return transporter
}

export async function sendEmail(params: { to: string; subject: string; text: string }): Promise<void> {
  const t = getTransporter()
  await t.sendMail({
    from:    EMAIL_USER,
    to:      params.to,
    subject: params.subject,
    text:    params.text,
  })
}

let lastPollAt: Date | null = null
let lastPollError: string | null = null

export function getEmailStatus() {
  return {
    configured:    isEmailConfigured(),
    lastPollAt:    lastPollAt?.toISOString() ?? null,
    lastPollError,
  }
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

async function processIncomingMessage(msg: FetchMessageObject): Promise<void> {
  const fromAddress = msg.envelope?.from?.[0]?.address
  if (!fromAddress) return

  const normalized = normalizeEmail(fromAddress)
  const subject = msg.envelope?.subject ?? '(sin asunto)'

  let text = ''
  if (msg.source) {
    const parsed = await simpleParser(msg.source)
    text = parsed.text ?? ''
  }

  // Igual que con WhatsApp: si el remitente no matchea ningún contacto
  // existente, se crea un lead nuevo — un email de un desconocido es,
  // en la práctica, una consulta entrante.
  const candidates = await db.query.contacts.findMany({ where: isNotNull(contacts.email) })
  let contact = candidates.find((row) => row.email && normalizeEmail(row.email) === normalized)

  if (!contact) {
    const [created] = await db.insert(contacts).values({
      name:   fromAddress,
      email:  fromAddress,
      status: 'lead',
    }).returning()

    if (!created) return
    contact = created
    await logActivity({ contactId: contact.id, type: 'created' })
  }

  await logActivity({
    contactId: contact.id,
    type:      'email',
    content:   text.slice(0, 5000),
    metadata:  { direction: 'incoming', subject },
  })
}

async function readLastUid(): Promise<number | null> {
  try {
    const raw = await readFile(POLL_STATE_PATH, 'utf-8')
    const data = JSON.parse(raw) as { lastUid?: number }
    return typeof data.lastUid === 'number' ? data.lastUid : null
  } catch {
    return null
  }
}

async function writeLastUid(uid: number): Promise<void> {
  await writeFile(POLL_STATE_PATH, JSON.stringify({ lastUid: uid }), 'utf-8')
}

export async function pollInbox(): Promise<void> {
  if (!isEmailConfigured() || !IMAP_HOST) return

  const client = new ImapFlow({
    host:    IMAP_HOST,
    port:    IMAP_PORT,
    secure:  IMAP_PORT === 993,
    auth:    { user: EMAIL_USER!, pass: EMAIL_PASSWORD! },
    logger:  false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const mailbox = client.mailbox
      if (!mailbox) throw new Error('No se pudo abrir INBOX')

      const currentTopUid = mailbox.uidNext - 1
      const lastUid = await readLastUid()

      if (lastUid === null) {
        // Primera conexión: no se procesa el historial de la casilla como
        // si fueran mensajes nuevos (una bandeja real tiene años de
        // newsletters, notificaciones automáticas, etc. — tratarlas como
        // leads sería un desastre). Solo se marca el punto de partida; de
        // acá en más, se procesa lo que llegue nuevo.
        await writeLastUid(currentTopUid)
      } else if (currentTopUid > lastUid) {
        let highestSeen = lastUid

        // Rango por UID en vez de la flag \Seen: no depende de (ni pisa)
        // el estado de leído/no leído real de la casilla, que el dueño
        // puede estar usando desde su cliente de correo habitual.
        for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
          try {
            await processIncomingMessage(msg)
          } catch (err) {
            console.error('Error procesando un mensaje entrante:', err)
          }
          if (msg.uid > highestSeen) highestSeen = msg.uid
        }

        await writeLastUid(highestSeen)
      }
    } finally {
      lock.release()
    }

    await client.logout()
    lastPollAt = new Date()
    lastPollError = null
  } catch (err) {
    lastPollError = err instanceof Error ? err.message : 'Error desconocido al leer el correo'
    console.error('Error consultando el inbox de email:', err)
    try { client.close() } catch { /* ya estaba cerrada */ }
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

export function startEmailPolling(intervalMs = 60_000): void {
  if (!isEmailConfigured()) {
    console.log('Email no configurado — no se inicia el polling del inbox (ver EMAIL_* en .env)')
    return
  }
  if (pollTimer) return

  console.log(`Polling del inbox de email cada ${intervalMs / 1000}s`)
  void pollInbox()
  pollTimer = setInterval(() => { void pollInbox() }, intervalMs)
}
