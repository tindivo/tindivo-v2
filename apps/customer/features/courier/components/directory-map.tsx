'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { getCoverage, getCoveragePolygon } from '@/lib/coverage'
import type { DirectoryBusiness } from '../lib/directory'

// Leaflet toca `window`: solo se carga en cliente (mismo patrón que `MapPicker`).
const DirectoryMapInner = dynamic(() => import('./directory-map-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#E8E9EB]" />,
})

function boundsFrom(
  polygon: { lat: number; lng: number }[] | null,
  centerFallback: { lat: number; lng: number },
) {
  if (polygon && polygon.length >= 3) {
    const lats = polygon.map((p) => p.lat)
    const lngs = polygon.map((p) => p.lng)
    const south = Math.min(...lats)
    const north = Math.max(...lats)
    const west = Math.min(...lngs)
    const east = Math.max(...lngs)
    const padLat = Math.max((north - south) * 0.2, 0.006)
    const padLng = Math.max((east - west) * 0.2, 0.006)
    return {
      south: south - padLat,
      north: north + padLat,
      west: west - padLng,
      east: east + padLng,
    }
  }
  return {
    south: centerFallback.lat - 0.03,
    north: centerFallback.lat + 0.03,
    west: centerFallback.lng - 0.03,
    east: centerFallback.lng + 0.03,
  }
}

export function DirectoryMap({ businesses }: { businesses: DirectoryBusiness[] }) {
  const [ready, setReady] = useState<{
    bounds: { south: number; west: number; north: number; east: number }
    center: { lat: number; lng: number }
  } | null>(null)

  useEffect(() => {
    let on = true
    Promise.all([getCoverage(), getCoveragePolygon()]).then(([cov, poly]) => {
      if (!on) return
      const polygon = poly?.polygon ?? null
      // El centroide del polígono real, no el centro de `app_settings.coverage`
      // (su fallback está desviado ~25km al oeste del San Jacinto real —
      // memoria del repo). El polígono sí está sembrado correctamente.
      const center =
        polygon && polygon.length >= 3
          ? {
              lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
              lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length,
            }
          : { lat: cov.centerLat, lng: cov.centerLng }
      setReady({ bounds: boundsFrom(polygon, center), center })
    })
    return () => {
      on = false
    }
  }, [])

  if (!ready) return <div className="h-full w-full animate-pulse bg-[#E8E9EB]" />

  return <DirectoryMapInner businesses={businesses} bounds={ready.bounds} center={ready.center} />
}
