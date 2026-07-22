'use client'

import { useEffect, useState } from 'react'
import { useApp } from '../app-context'

type ScrapingStatus = {
  status: 'ok'
  configured: boolean
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
  if (score >= 4) return 'scraping-score-high'
  if (score === 3) return 'scraping-score-mid'
  return 'scraping-score-low'
}

export default function ScrapingPage() {
  const { apiFetch } = useApp()

  const [statusLoading, setStatusLoading] = useState(true)
  const [configured, setConfigured]       = useState(false)
  const [statusError, setStatusError]     = useState<string | null>(null)

  const [query, setQuery]     = useState('')
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
    const trimmed = query.trim()
    if (!trimmed) return

    setSearching(true)
    setSearchError(null)
    setImportError(null)
    setImportResult(null)

    try {
      const res = await apiFetch('/api/scraping/search', {
        method: 'POST',
        body: JSON.stringify({ query: trimmed }),
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
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Prospección</h1>
          <p>Buscá negocios en Google Maps, analizalos con IA y importá los mejores prospectos como leads.</p>
        </div>
      </div>

      {statusLoading ? (
        <div className="panel">
          <p className="empty-state">Cargando…</p>
        </div>
      ) : statusError ? (
        <div className="panel">
          <div className="form-error">{statusError}</div>
        </div>
      ) : !configured ? (
        <div className="panel">
          <p className="empty-state">
            La prospección automática todavía no está configurada — completá GOOGLE_MAPS_API_KEY y
            ANTHROPIC_API_KEY en el .env del servidor.
          </p>
        </div>
      ) : (
        <>
          <div className="panel">
            <form onSubmit={handleSearch} className="inline-form">
              <div className="inline-field">
                <label htmlFor="scraping-query">¿Qué buscás?</label>
                <input
                  id="scraping-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="restaurantes en Colonia del Sacramento"
                />
              </div>
              <button type="submit" className="btn" disabled={searching || !query.trim()}>
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </form>

            {searching && (
              <p style={{ marginTop: 'var(--spacing-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Buscando y analizando con IA — esto puede tardar hasta un minuto…
              </p>
            )}

            {searchError && (
              <div className="form-error" style={{ marginTop: 'var(--spacing-3)' }}>{searchError}</div>
            )}
          </div>

          {results && (
            <div className="panel">
              <h2>Resultados ({results.length})</h2>

              {results.length === 0 ? (
                <p className="empty-state">No se encontraron resultados para esa búsqueda.</p>
              ) : (
                <>
                  <div className="bulk-toolbar">
                    <button type="button" className="btn-ghost" onClick={selectAll}>Seleccionar todos</button>
                    <button type="button" className="btn-ghost" onClick={deselectAll}>Deseleccionar todos</button>
                    <button type="button" className="btn-ghost" onClick={selectHighScore}>Seleccionar score alto (4-5)</button>
                    <span className="bulk-toolbar-count">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
                  </div>

                  <div className="scraping-results">
                    {results.map((place) => (
                      <div key={place.placeId} className="scraping-result-card">
                        <input
                          type="checkbox"
                          className="scraping-result-checkbox"
                          checked={selected.has(place.placeId)}
                          onChange={() => toggleSelected(place.placeId)}
                          aria-label={`Seleccionar ${place.name}`}
                        />

                        <div className="scraping-result-body">
                          <div className="scraping-result-header">
                            <span className="scraping-result-name">{place.name}</span>
                            {place.category && (
                              <span className="scraping-result-category">{place.category}</span>
                            )}
                            {!place.website && (
                              <span className="scraping-badge-no-website">Sin sitio web</span>
                            )}
                            {place.analysis && (
                              <span className={`scraping-score ${scoreClass(place.analysis.score)}`}>
                                Score {place.analysis.score}/5
                              </span>
                            )}
                          </div>

                          <div className="scraping-result-meta">
                            <span>{place.address}</span>
                            {place.phone && <span>{place.phone}</span>}
                            {place.rating != null && (
                              <span>
                                {place.rating} ⭐{place.reviews != null ? ` (${place.reviews} reseñas)` : ''}
                              </span>
                            )}
                            {place.email && <span>✉ {place.email}</span>}
                          </div>

                          <div className="scraping-result-links">
                            {place.googleMapsUrl && (
                              <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                                Ver en Google Maps
                              </a>
                            )}
                            {place.website && (
                              <a href={place.website} target="_blank" rel="noopener noreferrer">
                                Visitar sitio web
                              </a>
                            )}
                            {place.socialLinks.map((link) => (
                              <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer">
                                {link.platform}
                              </a>
                            ))}
                          </div>

                          {place.analysis ? (
                            <>
                              <p className="scraping-reasoning">{place.analysis.reasoning}</p>
                              <div className="scraping-message">
                                <p>{place.analysis.openingMessage}</p>
                                <div className="scraping-message-actions">
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    onClick={() => handleCopy(place.placeId, place.analysis!.openingMessage)}
                                  >
                                    {copiedId === place.placeId ? 'Copiado' : 'Copiar mensaje'}
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : place.analysisError ? (
                            <p className="scraping-analysis-error">No se pudo analizar este resultado</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={selected.size === 0 || importing}
                      onClick={handleImport}
                    >
                      {importing ? 'Importando…' : `Importar seleccionados (${selected.size})`}
                    </button>

                    {importError && <div className="form-error">{importError}</div>}
                    {importResult && (
                      <p style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-sm)' }}>
                        Importados: {importResult.created} creado{importResult.created === 1 ? '' : 's'}, {importResult.skipped} omitido{importResult.skipped === 1 ? '' : 's'} (ya existían).
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
