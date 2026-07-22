import type { Metadata } from 'next'
import '../styles/theme.css'

export const metadata: Metadata = {
  title: 'Colonia Cloud CRM',
  description: 'CRM interno de Colonia Cloud',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
