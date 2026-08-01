import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-foreground">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <img src="/brand/icono.svg" alt="" className="size-5 shrink-0 brightness-0 invert" />
        <span className="font-bold uppercase tracking-wider">Colonia Cloud</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardContent>
          {children}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Colonia Cloud. Todos los derechos reservados.
      </p>
    </div>
  )
}
