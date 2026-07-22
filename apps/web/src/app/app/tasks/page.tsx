'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'

type Task = {
  id: string
  title: string
  dueDate: string | null
  done: boolean
}

function isOverdue(dueDate: string | null, done: boolean) {
  if (!dueDate || done) return false
  return new Date(dueDate).getTime() < Date.now()
}

function formatDate(dueDate: string | null) {
  if (!dueDate) return null
  return new Date(dueDate).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })
}

export default function TasksPage() {
  const { apiFetch } = useApp()

  const [tasks, setTasks]           = useState<Task[] | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [title, setTitle]     = useState('')
  const [dueDate, setDueDate] = useState('')

  async function loadTasks() {
    const res  = await apiFetch('/api/tasks')
    const data = await res.json() as { items: Task[] }
    setTasks(data.items)
  }

  useEffect(() => {
    loadTasks().catch(() => setError('No se pudieron cargar las tareas'))
  }, [apiFetch])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          dueDate: dueDate || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'No se pudo crear la tarea')
      }

      setTitle('')
      setDueDate('')
      await loadTasks()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(task: Task) {
    setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) ?? null)

    const res = await apiFetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !task.done }),
    })

    if (!res.ok) {
      setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)) ?? null)
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks((prev) => prev?.filter((task) => task.id !== id) ?? null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tareas</h1>
          <p>Seguimientos y pendientes del equipo.</p>
        </div>
      </div>

      <div className="panel">
        <form className="inline-form" onSubmit={handleSubmit}>
          <div className="inline-field">
            <label htmlFor="task-title">Título</label>
            <input
              id="task-title" required
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Llamar a María para cerrar propuesta"
            />
          </div>
          <div className="inline-field" style={{ flex: '0 0 180px' }}>
            <label htmlFor="task-due">Vencimiento</label>
            <input
              id="task-due" type="date"
              value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Agregando…' : 'Agregar tarea'}
          </button>
        </form>

        {error && (
          <div className="form-error" style={{ marginTop: 'var(--spacing-4)' }}>{error}</div>
        )}
      </div>

      <div className="panel">
        {!tasks ? (
          <p className="empty-state">Cargando…</p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">No hay tareas todavía.</p>
        ) : (
          <div className="task-list">
            {tasks.map((task) => {
              const due = formatDate(task.dueDate)
              return (
                <div key={task.id} className={`task-row${task.done ? ' done' : ''}`}>
                  <input
                    type="checkbox" className="task-checkbox"
                    checked={task.done} onChange={() => handleToggle(task)}
                  />
                  <div className="task-body">
                    <div className="task-title">{task.title}</div>
                    {due && (
                      <div className={`task-due${isOverdue(task.dueDate, task.done) ? ' overdue' : ''}`}>
                        {due}
                      </div>
                    )}
                  </div>
                  <button className="link-danger" onClick={() => handleDelete(task.id)}>Eliminar</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
