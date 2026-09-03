'use client'

import { Ico } from '@/components/admin'
import { type LandmarkPoint, LandmarksMap, type LatLng } from './landmarks-map'

/**
 * Postal quieta, igual que la vista previa de `apps/customer`
 * (`map-picker.tsx`): no se arrastra ni se toca directo, solo resume qué hay
 * puesto. El trabajo de verdad —agregar un punto, ubicarlo con precisión en
 * satélite— pasa siempre por `LandmarksSheet`, a pantalla completa, donde el
 * dedo no compite con el scroll de la página ni con una tarjeta angosta.
 */
export function LandmarksPreview({
  coverage,
  landmarks,
  center,
  onOpen,
  heightPx = 200,
}: {
  coverage: LatLng[] | null
  landmarks: LandmarkPoint[]
  center: LatLng
  onOpen: () => void
  heightPx?: number
}) {
  const activos = landmarks.filter((l) => l.active).length

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-ink/10 shadow-xs"
      // `isolation: isolate` confina los z-index de Leaflet a este recuadro.
      style={{ height: heightPx, isolation: 'isolate' }}
    >
      <LandmarksMap
        coverage={coverage}
        landmarks={landmarks}
        center={center}
        interactive={false}
        mode="street"
      />

      <button
        type="button"
        onClick={onOpen}
        aria-label="Gestionar referencias en pantalla completa"
        className="absolute inset-0 z-[600] transition-colors hover:bg-ink/[0.04] active:bg-ink/[0.06]"
      >
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-card py-1.5 pr-3 pl-2 font-bold text-[12px] text-ink shadow-elev-3">
          <Ico.mapPin className="h-3.5 w-3.5 text-brand-dark" />
          {landmarks.length === 0
            ? 'Sin referencias todavía'
            : `${activos} de ${landmarks.length} activas`}
        </span>
        <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-bold text-[12px] text-brand-dark shadow-elev-3">
          <Ico.maximize className="h-3.5 w-3.5" />
          Pantalla completa
        </span>
      </button>
    </div>
  )
}
