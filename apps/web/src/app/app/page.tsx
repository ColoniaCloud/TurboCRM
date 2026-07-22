'use client'

import { useEffect, useState } from 'react'
import { useApp } from './app-context'

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
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hola, {me.user.name.split(' ')[0]}</h1>
          <p>Esto es lo que está pasando en el CRM.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="value">{counts ? counts.contacts : '—'}</div>
          <div className="label">Contactos</div>
        </div>
        <div className="stat-card">
          <div className="value">{counts ? counts.deals : '—'}</div>
          <div className="label">Deals en el pipeline</div>
        </div>
        <div className="stat-card">
          <div className="value">{counts ? counts.pendingTasks : '—'}</div>
          <div className="label">Tareas pendientes</div>
        </div>
      </div>

      <div className="panel">
        <div className="app-meta">
          <div className="app-meta-row"><span>Tu rol</span><span>{me.user.role}</span></div>
          <div className="app-meta-row"><span>Email</span><span>{me.user.email}</span></div>
        </div>
      </div>
    </div>
  )
}
