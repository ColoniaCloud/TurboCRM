'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/lib/auth'
import { getApiUrl } from '@/lib/api-url'
import { AppProvider, type Me } from './app-context'
import './app.css'

// Sin onboarding ni módulos por tenant en Turbo (single-tenant):
// el nav es una lista fija.
const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/app',            label: 'Resumen' },
  { href: '/app/contacts',   label: 'Contactos' },
  { href: '/app/scraping',   label: 'Prospección' },
  { href: '/app/pipeline',   label: 'Pipeline' },
  { href: '/app/tasks',      label: 'Tareas' },
  { href: '/app/payments',   label: 'Cobros' },
  { href: '/app/campaigns',  label: 'Campañas' },
  { href: '/app/settings',   label: 'Configuración' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [me, setMe]           = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // No usamos el hook reactivo useSession() acá: su store interno puede
    // devolver momentáneamente el snapshot "sin sesión" que quedó de ANTES
    // de loguearse (por ejemplo, si esta misma pestaña ya había rebotado a
    // /auth/sign-in una vez), y recién se refresca en un tick posterior via
    // setTimeout(0) — si redirigimos con ese valor viejo, un login exitoso
    // rebota de nuevo al login. Golpeamos /api/me directo: si el browser no
    // tiene una cookie de sesión válida, la API responde 401 y ahí sí
    // redirigimos, sin depender del timing del store reactivo.
    async function load() {
      try {
        const meRes = await fetch(`${getApiUrl()}/api/me`, { credentials: 'include' })

        if (!meRes.ok) {
          if (!cancelled) router.replace('/auth/sign-in')
          return
        }

        const meData = await meRes.json() as Me

        if (!cancelled) {
          setMe(meData)
          setLoading(false)
        }
      } catch {
        if (!cancelled) router.replace('/auth/sign-in')
      }
    }

    load()
    return () => { cancelled = true }
  }, [router])

  async function handleSignOut() {
    await signOut()
    router.replace('/auth/sign-in')
  }

  if (loading || !me) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="app-loading">Cargando…</p>
        </main>
      </div>
    )
  }

  return (
    <AppProvider me={me}>
      <div className="app-shell app-shell--with-sidebar">
        <aside className="app-sidebar">
          <div className="app-brand">
            <img src="/brand/icono.svg" alt="" className="app-brand-icon" />
            <span>Colonia Cloud</span>
          </div>
          <nav className="app-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-link${pathname === item.href ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="app-content">
          <header className="app-header">
            <span className="app-tenant">{me.user.email}</span>
            <button className="app-signout" onClick={handleSignOut}>Cerrar sesión</button>
          </header>

          <main className="app-main app-main--scroll">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  )
}
