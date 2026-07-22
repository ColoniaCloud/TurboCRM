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
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuración</h1>
          <p>Ajustes del CRM.</p>
        </div>
      </div>

      <div className="settings-shell">
        <nav className="settings-nav">
          {SETTINGS_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`settings-nav-link${pathname === item.href ? ' active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="settings-content">
          {children}
        </div>
      </div>
    </div>
  )
}
