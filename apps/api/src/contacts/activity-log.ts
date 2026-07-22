import { db } from '../db'
import { contactActivities } from '../db/schema'
import type { ActivityType } from '@colonia-crm/shared'

type ActivityParams = {
  contactId: string
  userId?: string | null
  type: ActivityType
  content?: string | null
  metadata?: Record<string, unknown> | null
}

export async function logActivity(params: ActivityParams) {
  const [activity] = await db.insert(contactActivities).values(toRow(params)).returning()
  return activity
}

export async function logActivities(rows: ActivityParams[]) {
  if (rows.length === 0) return
  await db.insert(contactActivities).values(rows.map(toRow))
}

function toRow(params: ActivityParams) {
  return {
    contactId: params.contactId,
    userId:    params.userId ?? null,
    type:      params.type,
    content:   params.content ?? null,
    metadata:  params.metadata ?? null,
  }
}
