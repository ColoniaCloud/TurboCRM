'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, Radar, Kanban, ListTodo, Receipt, Megaphone, Settings,
} from 'lucide-react'
import { signOut } from '@/lib/auth'
import { getApiUrl } from '@/lib/api-url'
import { AppProvider, type Me } from './app-context'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'

// Sin onboarding ni módulos por tenant en Turbo (single-tenant):
// el nav es una lista fija.
const NAV_ITEMS = [
  { href: '/app',            label: 'Resumen',       icon: LayoutDashboard },
  { href: '/app/contacts',   label: 'Contactos',     icon: Users },
  { href: '/app/scraping',   label: 'Prospección',   icon: Radar },
  { href: '/app/pipeline',   label: 'Pipeline',      icon: Kanban },
  { href: '/app/tasks',      label: 'Tareas',        icon: ListTodo },
  { href: '/app/payments',   label: 'Cobros',        icon: Receipt },
  { href: '/app/campaigns',  label: 'Campañas',      icon: Megaphone },
  { href: '/app/settings',   label: 'Configuración', icon: Settings },
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
      <div className="dark flex min-h-svh items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  return (
    <AppProvider me={me}>
      <SidebarProvider className="dark">
        <SidebarInset>
          <header className="flex h-12 items-center justify-end border-b px-6">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{me.user.email}</span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>Cerrar sesión</Button>
              <SidebarTrigger />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </SidebarInset>

        <Sidebar side="right" collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-muted-foreground">
              <img src="/brand/icono.svg" alt="" className="size-5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Colonia Cloud</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    render={
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </AppProvider>
  )
}
