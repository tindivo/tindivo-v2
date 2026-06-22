'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { getCoverage, getCoveragePolygon, haversineKm, pointInPolygon } from '@/lib/coverage'
import type { LatLng } from './map-picker-inner'

export type { LatLng }

// Leaflet touches `window`: must load client-only.
const MapInner = dynamic(() => import('./map-picker-inner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse" style={{ background: 'rgba(26,22,20,0.06)' }} />
  ),
})

/**
 * Selector de ubicación con pin arrastrable (Leaflet + OSM) y zona de cobertura.
 * El centro y el polígono vienen de app_settings (sin hardcode). El pin se puede
 * mover libremente, pero `onValidityChange` informa si quedó dentro de la zona para
 * que el formulario bloquee "Guardar" (mensaje inline, no se reubica el pin).
 */
export function MapPicker({
  value,
  onChange,
  onValidityChange,
  heightPx = 180,
}: {
  value: LatLng | null
  onChange: (c: LatLng) => void
  onValidityChange?: (inside: boolean) => void
  heightPx?: number
}) {
  const [center, setCenter] = useState<LatLng | null>(null)
  const [polygon, setPolygon] = useState<LatLng[] | null>(null)
  const [radiusKm, setRadiusKm] = useState(3)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let on = true
    Promise.all([getCoverage(), getCoveragePolygon()]).then(([cov, poly]) => {
      if (!on) return
      setCenter({ lat: cov.centerLat, lng: cov.centerLng })
      setRadiusKm(cov.radiusKm)
      setPolygon(poly?.polygon ?? null)
      setLoaded(true)
    })
    return () => {
      on = false
    }
  }, [])

  // Sin selección previa: el centro de cobertura es la selección inicial,
  // así "Guardar" funciona aunque el usuario no mueva el pin.
  useEffect(() => {
    if (center && !value) onChange(center)
  }, [center, value, onChange])

  const pos = value ?? center

  // Dentro de la zona: polígono si está configurado; si no, círculo de radio (fallback).
  const inside = useMemo(() => {
    if (!loaded || !pos) return true
    if (polygon) return pointInPolygon(pos, polygon)
    if (center) return haversineKm(pos, center) <= radiusKm
    return true
  }, [loaded, pos, polygon, center, radiusKm])

  useEffect(() => {
    if (loaded && pos) onValidityChange?.(inside)
  }, [inside, loaded, pos, onValidityChange])

  const circle = polygon ? null : center ? { center, radiusKm } : null

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl"
        // `isolation: isolate` crea un stacking context propio: confina los z-index
        // internos de Leaflet (panes/controles hasta ~1000) para que no se pinten por
        // encima de modales/bottom-sheets (que están en z-index menor en el contexto raíz).
        style={{ height: heightPx, border: '1px solid rgba(26,22,20,0.08)', isolation: 'isolate' }}
      >
        {pos ? (
          <MapInner position={pos} onChange={onChange} polygon={polygon} circle={circle} />
        ) : (
          <div
            className="h-full w-full animate-pulse"
            style={{ background: 'rgba(26,22,20,0.06)' }}
          />
        )}
        <span
          className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-white/95 px-2 py-1 font-bold text-[9px] uppercase shadow-sm"
          style={{
            letterSpacing: '0.1em',
            zIndex: 1000,
            fontFamily: 'var(--font-jetbrains), monospace',
          }}
        >
          Arrastra para ajustar
        </span>
      </div>
      <div
        className="mt-1.5 flex items-center gap-1.5 text-[11px]"
        style={{
          color: inside ? 'rgba(26,22,20,0.55)' : '#C2410C',
          fontFamily: 'var(--font-jetbrains), monospace',
        }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: inside ? '#F97316' : '#DC2626' }}
        />
        {!pos
          ? 'Cargando mapa…'
          : inside
            ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} · San Jacinto, Áncash`
            : 'Fuera de la zona de reparto de San Jacinto'}
      </div>
    </div>
  )
}
