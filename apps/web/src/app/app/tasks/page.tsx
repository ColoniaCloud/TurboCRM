'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Tareas</h1>
        <p className="text-sm text-muted-foreground">Seguimientos y pendientes del equipo.</p>
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-1 min-w-48 flex-col gap-1.5">
              <Label htmlFor="task-title">Título</Label>
              <Input
                id="task-title" required
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Llamar a María para cerrar propuesta"
              />
            </div>
            <div className="flex w-44 flex-col gap-1.5">
              <Label htmlFor="task-due">Vencimiento</Label>
              <Input
                id="task-due" type="date"
                value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Agregando…' : 'Agregar tarea'}
            </Button>
          </form>

          {error && (
            <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {!tasks ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : tasks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay tareas todavía.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {tasks.map((task) => {
                const due = formatDate(task.dueDate)
                return (
                  <div key={task.id} className={`flex items-center gap-3 py-3 ${task.done ? 'opacity-50' : ''}`}>
                    <Checkbox checked={task.done} onCheckedChange={() => handleToggle(task)} />
                    <div className="flex-1">
                      <div className={`text-sm ${task.done ? 'line-through' : ''}`}>{task.title}</div>
                      {due && (
                        <div className={`text-xs ${isOverdue(task.dueDate, task.done) ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {due}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(task.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
