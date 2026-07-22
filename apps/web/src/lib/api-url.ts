// La API corre en la misma máquina que el web, en el puerto 3001. En vez de
// fijar la URL por env (que se rompe cada vez que el router cambia la IP de
// la máquina por DHCP — pasó en la práctica), el browser la deduce del host
// con el que abrió la app: localhost → localhost:3001, 192.168.x.x →
// 192.168.x.x:3001. NEXT_PUBLIC_API_URL queda como override explícito para
// producción, donde la API vive en su propio dominio.
export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`
  }
  return 'http://localhost:3001'
}
