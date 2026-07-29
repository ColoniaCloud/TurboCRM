'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const SETTINGS_NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/app/settings/custom-fields', label: 'Campos personalizados' },
  { href: '/app/settings/whatsapp',      label: 'WhatsApp' },
  { href: '/app/settings/email',         label: 'Email' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes del CRM.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[180px_1fr]">
        <nav className="flex flex-row gap-1 sm:flex-col">
          {SETTINGS_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-primary/15 text-primary-foreground dark:text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-6">
          {children}
        </div>
      </div>
    </div>
  )
}
