'use client'

import { useEffect, useState } from 'react'
import { useApp } from './app-context'
import { Card, CardContent } from '@/components/ui/card'

type Counts = { contacts: number; deals: number; pendingTasks: number }

export default function AppHomePage() {
  const { me, apiFetch } = useApp()
  const [counts, setCounts] = useState<Counts | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [contactsRes, dealsRes, tasksRes] = await Promise.all([
        apiFetch('/api/contacts'),
        apiFetch('/api/deals'),
        apiFetch('/api/tasks'),
      ])

      const [contactsData, dealsData, tasksData] = await Promise.all([
        contactsRes.json() as Promise<{ items: unknown[] }>,
        dealsRes.json() as Promise<{ items: unknown[] }>,
        tasksRes.json() as Promise<{ items: { done: boolean }[] }>,
      ])

      if (!cancelled) {
        setCounts({
          contacts:     contactsData.items.length,
          deals:        dealsData.items.length,
          pendingTasks: tasksData.items.filter((task) => !task.done).length,
        })
      }
    }

    load()
    return () => { cancelled = true }
  }, [apiFetch])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Hola, {me.user.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">Esto es lo que está pasando en el CRM.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <div className="text-3xl font-bold">{counts ? counts.contacts : '—'}</div>
            <div className="text-sm text-muted-foreground">Contactos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-3xl font-bold">{counts ? counts.deals : '—'}</div>
            <div className="text-sm text-muted-foreground">Deals en el pipeline</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-3xl font-bold">{counts ? counts.pendingTasks : '—'}</div>
            <div className="text-sm text-muted-foreground">Tareas pendientes</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tu rol</span>
            <span>{me.user.role}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span>{me.user.email}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
