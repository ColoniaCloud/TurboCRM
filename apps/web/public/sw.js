// Service worker mínimo: existe únicamente para que el navegador considere
// la app "instalable" (criterio de Chrome/Edge). No cachea páginas ni
// datos de la API a propósito — este es un CRM autenticado y servir
// respuestas viejas desde caché podría mostrar datos incorrectos.
const ICON_CACHE = 'cc-crm-icons-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(ICON_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
  }
})
