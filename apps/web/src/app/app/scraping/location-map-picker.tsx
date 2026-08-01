'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { MapPin } from 'lucide-react'
import {
  SCRAPING_MIN_RADIUS_METERS,
  SCRAPING_MAX_RADIUS_METERS,
  SCRAPING_DEFAULT_RADIUS_METERS,
} from '@colonia-crm/shared'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export type LocationValue = {
  country:      string
  city:         string
  neighborhood: string
  lat:          number
  lng:          number
  radiusMeters: number
}

type Props = {
  apiKey:  string | null
  value:   LocationValue
  onChange: (next: LocationValue) => void
}

// Cacheado a nivel de módulo: React StrictMode monta los componentes dos
// veces en dev, y sin este cache el <script> del loader se inyectaría (y
// cargaría) dos veces por cada visita a la página.
let mapsLoaderPromise: Promise<typeof google> | null = null

function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (!mapsLoaderPromise) {
    setOptions({ key: apiKey, v: 'weekly' })
    // 'geocoding' aparte de 'maps': el Geocoder vive en esa librería en el
    // sistema de carga granular actual, no viene con el mapa base.
    mapsLoaderPromise = Promise.all([
      importLibrary('maps'),
      importLibrary('geocoding'),
    ]).then(() => window.google)
  }
  return mapsLoaderPromise
}

const FIELD_DEBOUNCE_MS = 800
const MAP_DEBOUNCE_MS   = 600

function addressComponent(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  ...types: string[]
): string {
  for (const type of types) {
    const found = components?.find((c) => c.types.includes(type))
    if (found) return found.long_name
  }
  return ''
}

export function LocationMapPicker({ apiKey, value, onChange }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<google.maps.Map | null>(null)
  const circleRef     = useRef<google.maps.Circle | null>(null)
  const geocoderRef   = useRef<google.maps.Geocoder | null>(null)

  const fieldDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mapDebounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Guardas anti-loop: una actualización programática de un lado (mapa →
  // campos o campos → mapa) no debe disparar la geocodificación del otro.
  const suppressNextIdleRef       = useRef(false)
  const suppressNextFieldSyncRef  = useRef(false)

  // Refs "espejo" del último value/onChange recibidos — los listeners de
  // Google Maps se registran una sola vez (no en cada render), así que
  // necesitan leer el valor más reciente sin quedar atados como dependencia.
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [mapError, setMapError]           = useState<string | null>(null)
  const [geocodeNotice, setGeocodeNotice] = useState<string | null>(null)

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    const geocoder = geocoderRef.current
    if (!geocoder) return

    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) return

      const components = results[0]?.address_components
      const country      = addressComponent(components, 'country')
      const city          = addressComponent(components, 'locality', 'administrative_area_level_2')
      const neighborhood = addressComponent(components, 'sublocality', 'sublocality_level_1', 'neighborhood')

      suppressNextFieldSyncRef.current = true
      onChangeRef.current({ ...valueRef.current, country, city, neighborhood, lat, lng })
    })
  }, [])

  // Carga el mapa una sola vez, apenas hay API key disponible.
  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    let cancelled = false

    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !containerRef.current || mapRef.current) return

        const map = new g.maps.Map(containerRef.current, {
          center:              { lat: value.lat, lng: value.lng },
          zoom:                13,
          streetViewControl:   false,
          mapTypeControl:      false,
          fullscreenControl:   false,
          clickableIcons:      false,
        })

        // No editable/draggable a propósito: con radios de varios km el
        // relleno del círculo cubre casi todo el viewport, y el modo
        // "editable" de Google intercepta drags que empiezan sobre el
        // relleno (no solo el borde) — competiría con arrastrar el mapa.
        // El centro sigue al mapa (pin fijo por CSS); el radio se ajusta
        // por el input numérico.
        const circle = new g.maps.Circle({
          map,
          center:       { lat: value.lat, lng: value.lng },
          radius:       value.radiusMeters,
          clickable:    false,
          editable:     false,
          draggable:    false,
          strokeColor:  '#84cc16',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor:    '#84cc16',
          fillOpacity:  0.12,
        })

        mapRef.current      = map
        circleRef.current   = circle
        geocoderRef.current = new g.maps.Geocoder()

        map.addListener('idle', () => {
          const center = map.getCenter()
          if (!center) return
          const lat = center.lat()
          const lng = center.lng()
          circle.setCenter({ lat, lng })

          if (suppressNextIdleRef.current) {
            // Nosotros movimos el mapa (geocode de campos → mapa) — el
            // texto de los campos ya es el correcto, no lo pisamos con
            // una reverse-geocode redundante, solo sincronizamos lat/lng.
            suppressNextIdleRef.current = false
            onChangeRef.current({ ...valueRef.current, lat, lng })
            return
          }

          if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current)
          mapDebounceRef.current = setTimeout(() => reverseGeocode(lat, lng), MAP_DEBOUNCE_MS)
        })
      })
      .catch((err) => {
        if (!cancelled) setMapError(err instanceof Error ? err.message : 'No se pudo cargar el mapa de Google')
      })

    return () => { cancelled = true }
    // Solo depende de apiKey — el mapa se crea una única vez (guardado por
    // mapRef.current) y de ahí en más vive fuera del ciclo de render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // Limpieza real solo al desmontar el componente (navegar fuera de
  // /app/scraping), no en cada re-render.
  useEffect(() => {
    return () => {
      if (fieldDebounceRef.current) clearTimeout(fieldDebounceRef.current)
      if (mapDebounceRef.current) clearTimeout(mapDebounceRef.current)
      if (mapRef.current) window.google?.maps.event.clearInstanceListeners(mapRef.current)
      if (circleRef.current) window.google?.maps.event.clearInstanceListeners(circleRef.current)
    }
  }, [])

  // Campos (país/ciudad/barrio) → mapa: geocodifica y centra, debounced.
  useEffect(() => {
    if (suppressNextFieldSyncRef.current) {
      suppressNextFieldSyncRef.current = false
      return
    }

    const map      = mapRef.current
    const geocoder = geocoderRef.current
    if (!map || !geocoder) return

    const address = [value.neighborhood, value.city, value.country].filter(Boolean).join(', ')
    if (!address) {
      setGeocodeNotice(null)
      return
    }

    if (fieldDebounceRef.current) clearTimeout(fieldDebounceRef.current)
    fieldDebounceRef.current = setTimeout(() => {
      geocoder.geocode({ address }, (results, status) => {
        if (status !== 'OK' || !results || results.length === 0) {
          setGeocodeNotice(status === 'ZERO_RESULTS' ? 'No encontramos esa ubicación todavía' : null)
          return
        }
        setGeocodeNotice(null)
        suppressNextIdleRef.current = true
        map.panTo(results[0]!.geometry.location)
      })
    }, FIELD_DEBOUNCE_MS)

    return () => {
      if (fieldDebounceRef.current) clearTimeout(fieldDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.country, value.city, value.neighborhood])

  // Radio: el círculo sigue al input numérico en vivo (fuente de verdad
  // para el radio es el campo, no un drag sobre el mapa — ver comentario
  // en la creación del Circle más arriba).
  useEffect(() => {
    circleRef.current?.setRadius(value.radiusMeters)
  }, [value.radiusMeters])

  function handleRadiusChange(raw: number) {
    if (!Number.isFinite(raw)) return
    onChange({ ...value, radiusMeters: raw })
  }

  function handleRadiusBlur(raw: number) {
    const clamped = Number.isFinite(raw)
      ? Math.min(SCRAPING_MAX_RADIUS_METERS, Math.max(SCRAPING_MIN_RADIUS_METERS, raw))
      : SCRAPING_DEFAULT_RADIUS_METERS
    onChange({ ...value, radiusMeters: clamped })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scraping-country">País</Label>
          <Input
            id="scraping-country"
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value })}
            placeholder="Uruguay"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scraping-city">Ciudad</Label>
          <Input
            id="scraping-city"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="Colonia del Sacramento"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scraping-neighborhood">Barrio</Label>
          <Input
            id="scraping-neighborhood"
            value={value.neighborhood}
            onChange={(e) => onChange({ ...value, neighborhood: e.target.value })}
            placeholder="Barrio Histórico"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-64">
        <Label htmlFor="scraping-radius">Radio de búsqueda (metros)</Label>
        <Input
          id="scraping-radius"
          type="number"
          min={SCRAPING_MIN_RADIUS_METERS}
          max={SCRAPING_MAX_RADIUS_METERS}
          step={500}
          value={value.radiusMeters}
          onChange={(e) => handleRadiusChange(e.target.valueAsNumber)}
          onBlur={(e) => handleRadiusBlur(e.target.valueAsNumber)}
        />
      </div>

      {mapError ? (
        <Alert variant="destructive"><AlertDescription>{mapError}</AlertDescription></Alert>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Mapa — arrastrá para posicionar el centro de búsqueda</Label>
          <div className="relative h-80 w-full overflow-hidden rounded-lg border">
            <div ref={containerRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-primary">
              <MapPin className="size-8 fill-primary/20" strokeWidth={2} />
            </div>
          </div>
          {geocodeNotice && <p className="text-xs text-muted-foreground">{geocodeNotice}</p>}
        </div>
      )}
    </div>
  )
}
