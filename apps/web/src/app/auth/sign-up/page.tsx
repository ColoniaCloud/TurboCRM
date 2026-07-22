'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/auth'

export default function SignUpPage() {
  const router             = useRouter()
  const [error,   setError]  = useState<string | null>(null)
  const [loading, setLoading]= useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form     = new FormData(e.currentTarget)
    const name     = form.get('name')     as string
    const email    = form.get('email')    as string
    const password = form.get('password') as string

    try {
      await signUp.email({ name, email, password })
      // Sin onboarding en Turbo (single-tenant): directo a /app.
      router.push('/app')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear la cuenta'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="auth-title">Crear cuenta</h1>
      <p className="auth-subtitle">Empezá a organizar tu equipo de ventas hoy.</p>

      {error && <div className="auth-error">{error}</div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="name">Nombre completo</label>
          <input
            id="name" name="name" type="text"
            className="auth-input" placeholder="Juan García"
            required autoComplete="name"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="email">Email</label>
          <input
            id="email" name="email" type="email"
            className="auth-input" placeholder="juan@empresa.com"
            required autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="password">Contraseña</label>
          <input
            id="password" name="password" type="password"
            className="auth-input" placeholder="Mínimo 8 caracteres"
            minLength={8} required autoComplete="new-password"
          />
        </div>

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <div className="auth-link-row">
        ¿Ya tenés cuenta? <Link href="/auth/sign-in">Iniciá sesión</Link>
      </div>
    </>
  )
}
