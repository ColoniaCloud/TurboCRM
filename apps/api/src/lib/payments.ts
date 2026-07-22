import { eq, and, lt, or } from 'drizzle-orm'
import { db } from '../db'
import { paymentSchedules, contacts } from '../db/schema'
import { logActivity } from '../contacts/activity-log'
import { sendWhatsAppMessage, getWhatsAppStatus } from './whatsapp-client'
import { sendEmail, isEmailConfigured } from './email'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatAmount(amount: string, currency: string): string {
  const num = Number(amount)
  return `${currency} ${Number.isFinite(num) ? num.toLocaleString('es-UY') : amount}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' })
}

function buildReminderText(description: string, amount: string, currency: string, dueDate: Date): string {
  return `Hola! Te escribimos de Colonia Cloud para recordarte el pago pendiente "${description}" por ${formatAmount(amount, currency)}, con vencimiento el ${formatDate(dueDate)}. Cualquier consulta, contactanos por acá mismo. ¡Gracias!`
}

/**
 * Corre periódicamente: marca como vencidos los pagos pendientes que ya
 * pasaron su fecha, y manda el recordatorio (WhatsApp + email, lo que el
 * contacto tenga cargado) a los que entran en su ventana de aviso — como
 * mucho una vez por día calendario, sin importar cuántas veces dispare el
 * intervalo o cuántos restarts haya (se chequea contra la fecha guardada
 * de `lastReminderSentAt`, no contra un timer en memoria).
 */
export async function checkPaymentsAndSendReminders(): Promise<void> {
  const now   = new Date()
  const today = startOfDay(now)

  // 1. Pendientes con fecha de vencimiento ya pasada -> vencidos.
  await db.update(paymentSchedules)
    .set({ status: 'overdue', updatedAt: now })
    .where(and(
      eq(paymentSchedules.status, 'pending'),
      lt(paymentSchedules.dueDate, today),
    ))

  // 2. Pendientes o vencidos que entran en su ventana de recordatorio y no
  //    se les avisó hoy todavía.
  const candidates = await db
    .select({
      schedule: paymentSchedules,
      contactName:  contacts.name,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
    })
    .from(paymentSchedules)
    .innerJoin(contacts, eq(paymentSchedules.contactId, contacts.id))
    .where(or(
      eq(paymentSchedules.status, 'pending'),
      eq(paymentSchedules.status, 'overdue'),
    ))

  for (const row of candidates) {
    const { schedule, contactName, contactPhone, contactEmail } = row

    const reminderWindowStart = new Date(schedule.dueDate)
    reminderWindowStart.setDate(reminderWindowStart.getDate() - schedule.reminderDaysBefore)

    const dueForReminder = today >= startOfDay(reminderWindowStart)
    const alreadyRemindedToday = schedule.lastReminderSentAt
      ? startOfDay(new Date(schedule.lastReminderSentAt)).getTime() === today.getTime()
      : false

    if (!dueForReminder || alreadyRemindedToday) continue

    const text = buildReminderText(schedule.description, schedule.amount, schedule.currency, new Date(schedule.dueDate))
    let sentSomehow = false

    if (contactPhone) {
      try {
        const waStatus = await getWhatsAppStatus()
        if (waStatus.connected) {
          await sendWhatsAppMessage(contactPhone, text)
          sentSomehow = true
        }
      } catch (err) {
        console.error(`No se pudo mandar recordatorio de pago por WhatsApp a ${contactName}:`, err)
      }
    }

    if (contactEmail && isEmailConfigured()) {
      try {
        await sendEmail({ to: contactEmail, subject: 'Recordatorio de pago — Colonia Cloud', text })
        sentSomehow = true
      } catch (err) {
        console.error(`No se pudo mandar recordatorio de pago por email a ${contactName}:`, err)
      }
    }

    if (!sentSomehow) continue

    await db.update(paymentSchedules)
      .set({ lastReminderSentAt: now, updatedAt: now })
      .where(eq(paymentSchedules.id, schedule.id))

    await logActivity({
      contactId: schedule.contactId,
      type:      'payment_due',
      content:   text,
      metadata:  { scheduleId: schedule.id, amount: schedule.amount, currency: schedule.currency, dueDate: schedule.dueDate },
    })
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null

export function startPaymentReminders(intervalMs = 60 * 60 * 1000): void {
  if (reminderTimer) return

  console.log(`Chequeo de recordatorios de pago cada ${intervalMs / 1000 / 60} minutos`)
  void checkPaymentsAndSendReminders().catch((err) => console.error('Error chequeando recordatorios de pago:', err))
  reminderTimer = setInterval(() => {
    void checkPaymentsAndSendReminders().catch((err) => console.error('Error chequeando recordatorios de pago:', err))
  }, intervalMs)
}

export function computeNextOccurrence(dueDate: Date, recurrence: 'monthly' | 'annual'): Date {
  const next = new Date(dueDate)
  if (recurrence === 'monthly') {
    next.setMonth(next.getMonth() + 1)
  } else {
    next.setFullYear(next.getFullYear() + 1)
  }
  return next
}
