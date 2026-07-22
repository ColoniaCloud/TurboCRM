import type { ReactNode } from 'react'
import './auth.css'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <img src="/brand/icono.svg" alt="" className="auth-brand-icon" />
        <span className="auth-brand-name">Colonia Cloud</span>
      </div>
      <div className="auth-card">
        {children}
      </div>
      <p className="auth-footer">
        &copy; {new Date().getFullYear()} Colonia Cloud. Todos los derechos reservados.
      </p>
    </div>
  )
}
