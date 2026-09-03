'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { fieldSm, Ico, SectionHeader } from '@/components/admin'
import type { LandmarkPoint, LatLng } from '@/components/landmarks/landmarks-map'
import { LandmarksPreview } from '@/components/landmarks/landmarks-preview'
import { LandmarksSheet } from '@/components/landmarks/landmarks-sheet'
import { api, errMsg } from '@/lib/api'
import {
  LANDMARK_CATEGORY_META,
  MAP_LANDMARK_CATEGORIES,
  type MapLandmarkCategory,
} from '@/lib/landmark-categories'

/** Centro de San Jacinto. Solo se usa si `app_settings.coverage` no responde. */
const CENTRO: LatLng = { lat: -9.1465, lng: -78.2779 }

interface LandmarkRow extends LandmarkPoint {
  created_at: string
}

/**
 * Referencias del mapa (0208): boticas, colegios, mercado, iglesias… que
 * ayudan al cliente a ubicarse cuando marca su dirección.
 *
 * LA PÁGINA SOLO ENSEÑA UNA POSTAL QUIETA. El trabajo —tocar el mapa, ubicar
 * con precisión en satélite, cargar varios seguidos— vive en `LandmarksSheet`,
 * a pantalla completa. Es el mismo reparto que ya usa `apps/customer`
 * (`map-picker.tsx` + `location-sheet.tsx`): una tarjeta angosta compitiendo
 * con el scroll de la página es peor lienzo que uno que se lleva la pantalla
 * entera mientras se está tocando.
 *
 * Editar lo que ya existe (renombrar, cambiar categoría, apagar, borrar) se
 * queda en la lista, fuera de la hoja — eso no es "apuntar en el mapa", es
 * gestionar datos, y una lista lo hace mejor que un popup sobre un pin.
 */
export default function MapaReferenciasPage() {
  const [landmarks, setLandmarks] = useState<LandmarkRow[] | null>(null)
  const [coverage, setCoverage] = useState<LatLng[] | null>(null)
  const [center, setCenter] = useState<LatLng>(CENTRO)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [lm, s] = await Promise.all([
        api.get<ApiEnvelope<LandmarkRow[]>>('/admin/map-landmarks'),
        api.get<ApiEnvelope<{ key: string; value: unknown }[]>>('/admin/settings'),
      ])
      setLandmarks(lm.data)
      const map = Object.fromEntries(s.data.map((r) => [r.key, r.value])) as Record<string, unknown>
      const poly = (map.coverage_polygon as { polygon?: LatLng[] } | undefined)?.polygon ?? null
      setCoverage(poly)
      const cov = (map.coverage ?? {}) as { centerLat?: number; centerLng?: number }
      setCenter({ lat: cov.centerLat ?? CENTRO.lat, lng: cov.centerLng ?? CENTRO.lng })
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openSheet(focus?: string) {
    setFocusId(focus ?? null)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setFocusId(null)
  }

  async function crear(point: LatLng, name: string, category: MapLandmarkCategory) {
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/map-landmarks', { name, category, lat: point.lat, lng: point.lng })
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function actualizar(
    id: string,
    patch: Partial<Pick<LandmarkRow, 'name' | 'category' | 'active'>>,
  ) {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/admin/map-landmarks?id=${id}`, patch)
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function borrar(id: string) {
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/admin/map-landmarks?id=${id}`)
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionHeader
        eyebrow="Mapa"
        title="Referencias del mapa"
        description="Boticas, colegios, mercado, iglesias… puntos que ayudan al cliente a ubicarse."
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!coverage && landmarks !== null && (
        <div className="mb-3 rounded-xl bg-warning-soft p-3 text-[13px] text-amber-900">
          Todavía no hay zona de cobertura dibujada. El mapa igual funciona, pero sin la cobertura
          de fondo es más difícil ubicarse.
        </div>
      )}

      <LandmarksPreview
        coverage={coverage}
        landmarks={landmarks ?? []}
        center={center}
        onOpen={() => openSheet()}
      />

      <div className="t-card mt-4">
        <p className="t-display mb-2 text-[15px] text-ink">Referencias</p>

        {landmarks === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-ink/[0.05]" />
        ) : landmarks.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            Ninguna todavía. Abre el mapa a pantalla completa para agregar la primera.
          </p>
        ) : (
          <ul className="space-y-2">
            {landmarks.map((l) => (
              <LandmarkRowItem
                key={l.id}
                landmark={l}
                busy={busy}
                onFocus={() => openSheet(l.id)}
                onRename={(v) => actualizar(l.id, { name: v })}
                onCategoryChange={(v) => actualizar(l.id, { category: v })}
                onToggle={() => actualizar(l.id, { active: !l.active })}
                onDelete={() => borrar(l.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {sheetOpen && (
        <LandmarksSheet
          coverage={coverage}
          landmarks={landmarks ?? []}
          center={center}
          focusId={focusId}
          busy={busy}
          onClose={closeSheet}
          onCreate={crear}
        />
      )}
    </div>
  )
}

function LandmarkRowItem({
  landmark,
  busy,
  onFocus,
  onRename,
  onCategoryChange,
  onToggle,
  onDelete,
}: {
  landmark: LandmarkRow
  busy: boolean
  onFocus: () => void
  onRename: (name: string) => void
  onCategoryChange: (category: MapLandmarkCategory) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(landmark.name)
  const cambiado = name.trim() !== landmark.name && name.trim().length >= 2
  const meta = LANDMARK_CATEGORY_META[landmark.category]

  return (
    <li className="rounded-xl border border-ink/[0.06] p-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onFocus}
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: meta.color, opacity: landmark.active ? 1 : 0.35 }}
          title="Ver en el mapa a pantalla completa"
          aria-label={`Ver ${landmark.name} en el mapa`}
        />
        <input
          className={`${fieldSm} min-w-0 flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => cambiado && onRename(name.trim())}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {/* `fieldSm`, no `.t-field`: ese tiene 14px de padding vertical fijo,
            y forzarlo a `h-8` dejaba 4px para el texto — la opción elegida se
            veía en blanco, no es que faltara. */}
        <select
          className={`${fieldSm} min-w-0 flex-1 text-[13px]`}
          value={landmark.category}
          onChange={(e) => onCategoryChange(e.target.value as MapLandmarkCategory)}
        >
          {MAP_LANDMARK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {LANDMARK_CATEGORY_META[c].label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-muted">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="underline-offset-2 hover:underline"
        >
          {landmark.active ? 'Apagar' : 'Encender'}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-danger underline-offset-2 hover:underline"
          aria-label={`Borrar ${landmark.name}`}
        >
          <Ico.trash className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
