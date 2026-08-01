'use client'

import { useEffect, useState } from 'react'
import { SCRAPING_DEFAULT_CENTER, SCRAPING_DEFAULT_RADIUS_METERS } from '@colonia-crm/shared'
import { useApp } from '../app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LocationMapPicker, type LocationValue } from './location-map-picker'

type ScrapingStatus = {
  status: 'ok'
  configured: boolean
  mapsApiKey: string | null
}

const DEFAULT_LOCATION: LocationValue = {
  country:      '',
  city:         '',
  neighborhood: '',
  lat:          SCRAPING_DEFAULT_CENTER.lat,
  lng:          SCRAPING_DEFAULT_CENTER.lng,
  radiusMeters: SCRAPING_DEFAULT_RADIUS_METERS,
}

type PlaceAnalysis = {
  score: number
  reasoning: string
  openingMessage: string
}

type EnrichedPlace = {
  placeId: string
  name: string
  address: string
  phone: string | null
  website: string | null
  googleMapsUrl: string | null
  category: string | null
  rating: number | null
  reviews: number | null
  analysis: PlaceAnalysis | null
  analysisError: string | null
  email: string | null
  socialLinks: { platform: string; url: string }[]
}

type ImportResult = { created: number; skipped: number }

function scoreClass(score: number): string {
  if (score >= 4) return 'border-transparent bg-primary/15 text-primary-foreground dark:text-primary'
  if (score === 3) return 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  return 'border-transparent bg-destructive/10 text-destructive'
}

export default function ScrapingPage() {
  const { apiFetch } = useApp()

  const [statusLoading, setStatusLoading] = useState(true)
  const [configured, setConfigured]       = useState(false)
  const [mapsApiKey, setMapsApiKey]       = useState<string | null>(null)
  const [statusError, setStatusError]     = useState<string | null>(null)

  const [category, setCategory] = useState('')
  const [location, setLocation] = useState<LocationValue>(DEFAULT_LOCATION)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [results, setResults] = useState<EnrichedPlace[] | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      try {
        const res = await apiFetch('/api/scraping/status')
        if (!res.ok) throw new Error('No se pudo consultar el estado de la prospección')

        const body = await res.json() as ScrapingStatus
        if (cancelled) return

        setConfigured(body.configured)
        setMapsApiKey(body.mapsApiKey)
        setStatusError(null)
      } catch (err) {
        if (cancelled) return
        setStatusError(err instanceof Error ? err.message : 'No se pudo consultar el estado de la prospección')
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    }

    loadStatus()
    return () => { cancelled = true }
  }, [apiFetch])

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = category.trim()
    if (!trimmed) return

    setSearching(true)
    setSearchError(null)
    setImportError(null)
    setImportResult(null)

    try {
      const res = await apiFetch('/api/scraping/search', {
        method: 'POST',
        body: JSON.stringify({
          category:     trimmed,
          country:      location.country || undefined,
          city:         location.city || undefined,
          neighborhood: location.neighborhood || undefined,
          lat:          location.lat,
          lng:          location.lng,
          radiusMeters: location.radiusMeters,
        }),
      })

      const body = await res.json().catch(() => null) as
        | { status: 'ok'; items: EnrichedPlace[] }
        | { status: 'error'; error: string }
        | null

      if (!res.ok || !body || body.status === 'error') {
        throw new Error(body && body.status === 'error' ? body.error : 'No se pudo completar la búsqueda')
      }

      setResults(body.items)
      setSelected(new Set())
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'No se pudo completar la búsqueda')
    } finally {
      setSearching(false)
    }
  }

  function toggleSelected(placeId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(placeId)) {
        next.delete(placeId)
      } else {
        next.add(placeId)
      }
      return next
    })
  }

  function selectAll() {
    if (!results) return
    setSelected(new Set(results.map((r) => r.placeId)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function selectHighScore() {
    if (!results) return
    setSelected(new Set(
      results.filter((r) => r.analysis && r.analysis.score >= 4).map((r) => r.placeId),
    ))
  }

  async function handleCopy(placeId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(placeId)
      setTimeout(() => setCopiedId((current) => (current === placeId ? null : current)), 2000)
    } catch {
      // Si el navegador no permite acceder al portapapeles, no hacemos nada más.
    }
  }

  async function handleImport() {
    if (!results || selected.size === 0) return

    setImporting(true)
    setImportError(null)
    setImportResult(null)

    try {
      const places = results.filter((r) => selected.has(r.placeId))
      const res = await apiFetch('/api/scraping/import', {
        method: 'POST',
        body: JSON.stringify({ places }),
      })

      const body = await res.json().catch(() => null) as
        | { status: 'ok'; created: number; skipped: number }
        | { status: 'error'; error: string }
        | null

      if (!res.ok || !body || body.status === 'error') {
        throw new Error(body && body.status === 'error' ? body.error : 'No se pudo importar la selección')
      }

      setImportResult({ created: body.created, skipped: body.skipped })
      setSelected(new Set())
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'No se pudo importar la selección')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Prospección</h1>
        <p className="text-sm text-muted-foreground">Buscá negocios en Google Maps, analizalos con IA y importá los mejores prospectos como leads.</p>
      </div>

      {statusLoading ? (
        <Card><CardContent><p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p></CardContent></Card>
      ) : statusError ? (
        <Card><CardContent><Alert variant="destructive"><AlertDescription>{statusError}</AlertDescription></Alert></CardContent></Card>
      ) : !configured ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              La prospección automática todavía no está configurada — completá GOOGLE_MAPS_API_KEY y
              ANTHROPIC_API_KEY en el .env del servidor.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent>
              <form onSubmit={handleSearch} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5 sm:max-w-80">
                  <Label htmlFor="scraping-category">Rubro</Label>
                  <Input
                    id="scraping-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="restaurantes"
                  />
                </div>

                <LocationMapPicker apiKey={mapsApiKey} value={location} onChange={setLocation} />

                <Button type="submit" disabled={searching || !category.trim()} className="self-start">
                  {searching ? 'Buscando…' : 'Buscar'}
                </Button>
              </form>

              {searching && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Buscando y analizando con IA — esto puede tardar hasta un minuto…
                </p>
              )}

              {searchError && (
                <Alert variant="destructive" className="mt-3"><AlertDescription>{searchError}</AlertDescription></Alert>
              )}
            </CardContent>
          </Card>

          {results && (
            <Card>
              <CardContent>
                <h2 className="mb-3 text-base font-semibold">Resultados ({results.length})</h2>

                {results.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No se encontraron resultados para esa búsqueda.</p>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
                      <Button type="button" variant="outline" size="sm" onClick={selectAll}>Seleccionar todos</Button>
                      <Button type="button" variant="outline" size="sm" onClick={deselectAll}>Deseleccionar todos</Button>
                      <Button type="button" variant="outline" size="sm" onClick={selectHighScore}>Seleccionar score alto (4-5)</Button>
                      <span className="text-sm font-medium">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {results.map((place) => (
                        <div key={place.placeId} className="flex gap-3 rounded-lg border bg-background p-4">
                          <Checkbox
                            checked={selected.has(place.placeId)}
                            onCheckedChange={() => toggleSelected(place.placeId)}
                            aria-label={`Seleccionar ${place.name}`}
                            className="mt-0.5"
                          />

                          <div className="flex flex-1 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{place.name}</span>
                              {place.category && (
                                <span className="text-sm text-muted-foreground">{place.category}</span>
                              )}
                              {!place.website && (
                                <Badge variant="secondary">Sin sitio web</Badge>
                              )}
                              {place.analysis && (
                                <Badge className={scoreClass(place.analysis.score)}>
                                  Score {place.analysis.score}/5
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span>{place.address}</span>
                              {place.phone && <span>{place.phone}</span>}
                              {place.rating != null && (
                                <span>
                                  {place.rating} ⭐{place.reviews != null ? ` (${place.reviews} reseñas)` : ''}
                                </span>
                              )}
                              {place.email && <span>✉ {place.email}</span>}
                            </div>

                            <div className="flex flex-wrap gap-3 text-sm">
                              {place.googleMapsUrl && (
                                <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  Ver en Google Maps
                                </a>
                              )}
                              {place.website && (
                                <a href={place.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  Visitar sitio web
                                </a>
                              )}
                              {place.socialLinks.map((link) => (
                                <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  {link.platform}
                                </a>
                              ))}
                            </div>

                            {place.analysis ? (
                              <>
                                <p className="text-sm text-muted-foreground">{place.analysis.reasoning}</p>
                                <div className="rounded-md bg-muted/50 p-3">
                                  <p className="text-sm whitespace-pre-wrap">{place.analysis.openingMessage}</p>
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      type="button"
                                      variant="outline" size="sm"
                                      onClick={() => handleCopy(place.placeId, place.analysis!.openingMessage)}
                                    >
                                      {copiedId === place.placeId ? 'Copiado' : 'Copiar mensaje'}
                                    </Button>
                                  </div>
                                </div>
                              </>
                            ) : place.analysisError ? (
                              <p className="text-sm text-muted-foreground">No se pudo analizar este resultado</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-col items-start gap-3">
                      <Button
                        type="button"
                        disabled={selected.size === 0 || importing}
                        onClick={handleImport}
                      >
                        {importing ? 'Importando…' : `Importar seleccionados (${selected.size})`}
                      </Button>

                      {importError && <Alert variant="destructive"><AlertDescription>{importError}</AlertDescription></Alert>}
                      {importResult && (
                        <p className="text-sm text-primary-foreground">
                          Importados: {importResult.created} creado{importResult.created === 1 ? '' : 's'}, {importResult.skipped} omitido{importResult.skipped === 1 ? '' : 's'} (ya existían).
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
