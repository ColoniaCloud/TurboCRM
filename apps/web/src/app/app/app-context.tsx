'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { getApiUrl } from '@/lib/api-url'

export type Me = {
  user: { id: string; name: string; email: string; role: string }
}

type AppContextValue = {
  me: Me
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ me, children }: { me: Me; children: ReactNode }) {
  // Single-tenant: sin x-tenant-slug, solo credenciales de sesión.
  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    return fetch(`${getApiUrl()}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
  }, [])

  const value = useMemo(() => ({ me, apiFetch }), [me, apiFetch])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp debe usarse dentro de AppProvider')
  }
  return ctx
}
