'use client'

import { Button, IconButton, Segmented, useDialogFocus } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field, fieldSm, Ico } from '@/components/admin'
import {
  LANDMARK_CATEGORY_META,
  MAP_LANDMARK_CATEGORIES,
  type MapLandmarkCategory,
} from '@/lib/landmark-categories'
import type { MapLayerMode } from '@/lib/map-layers'
import { type LandmarkPoint, LandmarksMap, type LatLng } from './landmarks-map'

const CAPAS = [
  { value: 'street' as const, label: 'Mapa' },
  { value: 'satellite' as const, label: 'Satélite' },
]

/**
 * Pantalla completa para cargar referencias — mismo patrón que
 * `apps/customer` (`location-sheet.tsx`): portal a `document.body`, mapa a
 * sangre, foco atrapado, Escape cierra.
 *
 * SE QUEDA ABIERTA AL GUARDAR, a propósito. El caso real no es "un punto y
 * listo": es sectorizar el pueblo — todos los colegios, luego todas las
 * boticas — y cerrar entre cada uno sería obligar a reabrir la pantalla
 * completa por cada punto. `onClose` (la X) es el único que sale.
 */
export function LandmarksSheet({
  coverage,
  landmarks,
  center,
  focusId,
  busy,
  onClose,
  onCreate,
}: {
  coverage: LatLng[] | null
  landmarks: LandmarkPoint[]
  center: LatLng
  /** Vuela a este punto al abrir (llegó desde "centrar" en la lista). */
  focusId: string | null
  busy: boolean
  onClose: () => void
  onCreate: (point: LatLng, name: string, category: MapLandmarkCategory) => Promise<void>
}) {
  const [mode, setMode] = useState<MapLayerMode>('street')
  const [pending, setPending] = useState<LatLng | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<MapLandmarkCategory>('otro')
  const [mounted, setMounted] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])
  useDialogFocus(caja, { open: mounted, onClose })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function cancelarPick() {
    setPending(null)
    setName('')
    setCategory('otro')
  }

  async function guardar() {
    if (!pending || name.trim().length < 2) return
    await onCreate(pending, name.trim(), category)
    cancelarPick()
  }

  if (!mounted) return null

  const body = (
    <div
      ref={caja}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Gestionar referencias del mapa"
      className="fixed inset-0 z-[95] flex flex-col bg-surface animate-[t-fade-in_180ms_ease] focus:outline-none"
    >
      <div className="relative min-h-0 flex-1">
        <LandmarksMap
          coverage={coverage}
          landmarks={landmarks}
          center={center}
          interactive
          mode={mode}
          pending={pending}
          onPick={setPending}
          focusId={focusId}
        />

        {/* Barra superior: cerrar + fondo del mapa. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[730] flex items-start gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <IconButton
            type="button"
            onClick={onClose}
            aria-label="Cerrar y volver"
            title="Cerrar y volver"
            className="pointer-events-auto h-11 w-11 shrink-0 rounded-full bg-card text-ink shadow-elev-3"
          >
            <Ico.close className="h-5 w-5" />
          </IconButton>
          <div className="pointer-events-auto ml-auto rounded-[15px] bg-card/95 p-0.5 shadow-elev-3 backdrop-blur-sm">
            <Segmented size="sm" value={mode} onChange={setMode} options={CAPAS} />
          </div>
        </div>

        {/* La instrucción solo estorba mientras no hay nada que confirmar. */}
        {!pending && (
          <div className="pointer-events-none absolute inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-[600] flex justify-center px-4">
            <span className="rounded-full bg-ink/80 px-3.5 py-1.5 text-center font-medium text-[12px] text-white shadow-elev-3">
              Toca el mapa para agregar una referencia
            </span>
          </div>
        )}
      </div>

      {pending && (
        <div className="shrink-0 rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.4)]">
          <p className="font-display font-bold text-[15px] text-ink">Nuevo punto</p>
          <div className="mt-3 space-y-2.5">
            <Field label="Nombre">
              <input
                className={fieldSm}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Botica La Merced"
              />
            </Field>
            <Field label="Categoría">
              <select
                className="t-field"
                value={category}
                onChange={(e) => setCategory(e.target.value as MapLandmarkCategory)}
              >
                {MAP_LANDMARK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {LANDMARK_CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2 pt-1">
              <Button
                variant="brand"
                className="flex-1"
                disabled={busy || name.trim().length < 2}
                onClick={guardar}
              >
                Guardar y seguir
              </Button>
              <Button variant="outline" onClick={cancelarPick} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(body, document.body)
}
