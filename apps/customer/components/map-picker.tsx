'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { getCoverage } from '@/lib/coverage'
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
 * Selector de ubicación con pin arrastrable (Leaflet + OSM).
 * El centro inicial viene de app_settings.coverage (sin hardcode).
 */
export function MapPicker({
  value,
  onChange,
  heightPx = 180,
}: {
  value: LatLng | null
  onChange: (c: LatLng) => void
  heightPx?: number
}) {
  const [center, setCenter] = useState<LatLng | null>(null)

  useEffect(() => {
    let on = true
    getCoverage().then((c) => {
      if (on) setCenter({ lat: c.centerLat, lng: c.centerLng })
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

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ height: heightPx, border: '1px solid rgba(26,22,20,0.08)' }}
      >
        {pos ? (
          <MapInner position={pos} onChange={onChange} />
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
        style={{ color: 'rgba(26,22,20,0.55)', fontFamily: 'var(--font-jetbrains), monospace' }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: '#F97316' }}
        />
        {pos
          ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)} · San Jacinto, Áncash`
          : 'Cargando mapa…'}
      </div>
    </div>
  )
}
