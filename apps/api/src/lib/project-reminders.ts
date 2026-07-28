import { eq, and, isNull, lte } from 'drizzle-orm'
import { db } from '../db'
import { projectReminders, projects, tasks } from '../db/schema'
import { logActivity } from '../contacts/activity-log'
import type { ProjectReminderKind, ProjectReminderRecurrence } from '@colonia-crm/shared'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const KIND_LABELS: Record<ProjectReminderKind, string> = {
  hosting: 'Renovar hosting',
  domain: 'Renovar dominio',
  maintenance: 'Mantenimiento',
  other: 'Vencimiento',
}

/**
 * Corre periódicamente: por cada vencimiento de proyecto (hosting/dominio/
 * mantenimiento) que entra en su ventana de aviso y todavía no tiene una
 * tarea creada, genera una Tarea interna (nada de WhatsApp/email — esto es
 * para uso propio del admin, no para el cliente) y guarda el id de esa
 * tarea en `taskCreatedId` para no duplicarla en la próxima corrida.
 */
export async function checkProjectRemindersAndCreateTasks(): Promise<void> {
  const now = new Date()
  const today = startOfDay(now)

  const candidates = await db
    .select({
      reminder: projectReminders,
      projectName: projects.name,
      contactId: projects.contactId,
    })
    .from(projectReminders)
    .innerJoin(projects, eq(projectReminders.projectId, projects.id))
    .where(isNull(projectReminders.taskCreatedId))

  for (const row of candidates) {
    const { reminder, projectName, contactId } = row

    const reminderWindowStart = new Date(reminder.dueDate)
    reminderWindowStart.setDate(reminderWindowStart.getDate() - reminder.reminderDaysBefore)

    if (today < startOfDay(reminderWindowStart)) continue

    const title = `${KIND_LABELS[reminder.kind]}: ${reminder.description} — ${projectName}`

    const [task] = await db.insert(tasks).values({
      contactId,
      title,
      dueDate: reminder.dueDate,
    }).returning()
    const taskId = task!.id

    await db.update(projectReminders)
      .set({ taskCreatedId: taskId, updatedAt: now })
      .where(eq(projectReminders.id, reminder.id))

    await logActivity({
      contactId,
      type: 'project_reminder_due',
      content: title,
      metadata: { projectId: reminder.projectId, reminderId: reminder.id, taskId },
    })
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null

export function startProjectReminderChecks(intervalMs = 60 * 60 * 1000): void {
  if (reminderTimer) return

  console.log(`Chequeo de vencimientos de proyecto cada ${intervalMs / 1000 / 60} minutos`)
  void checkProjectRemindersAndCreateTasks().catch((err) => console.error('Error chequeando vencimientos de proyecto:', err))
  reminderTimer = setInterval(() => {
    void checkProjectRemindersAndCreateTasks().catch((err) => console.error('Error chequeando vencimientos de proyecto:', err))
  }, intervalMs)
}

export function computeNextProjectReminderDate(dueDate: Date, recurrence: Exclude<ProjectReminderRecurrence, 'none'>): Date {
  const next = new Date(dueDate)
  switch (recurrence) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'biannual':
      next.setMonth(next.getMonth() + 6)
      break
    case 'annual':
      next.setFullYear(next.getFullYear() + 1)
      break
  }
  return next
}

/**
 * Llamado desde el PATCH de /api/tasks cuando una tarea se marca `done`.
 * Si esa tarea fue auto-creada por un vencimiento de proyecto recurrente,
 * corre la fecha hacia adelante y limpia `taskCreatedId` para que el
 * próximo ciclo la vuelva a disparar. No-op si la tarea no está vinculada.
 */
export async function handleRecurringReminderTaskDone(taskId: string): Promise<void> {
  const reminder = await db.query.projectReminders.findFirst({
    where: eq(projectReminders.taskCreatedId, taskId),
  })
  if (!reminder) return

  if (reminder.recurrence === 'none') {
    return
  }

  const nextDueDate = computeNextProjectReminderDate(new Date(reminder.dueDate), reminder.recurrence)

  await db.update(projectReminders)
    .set({ dueDate: nextDueDate, taskCreatedId: null, updatedAt: new Date() })
    .where(eq(projectReminders.id, reminder.id))
}
