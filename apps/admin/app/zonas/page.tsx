'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { fieldSm, Ico, SectionHeader } from '@/components/admin'
import { type LatLng, type ZoneShape, ZonesMap } from '@/components/zones/zones-map'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

interface ZoneRow {
  id: string
  kind: string
  name: string
  polygon: LatLng[]
  active: boolean
}

/** Centro de San Jacinto. Solo se usa si `app_settings.coverage` no responde. */
const CENTRO: LatLng = { lat: -9.1465, lng: -78.2779 }

/**
 * Zonas de cobro.
 *
 * REGLA ENTERA, y cabe en una frase: dentro de la cobertura se cobra la tarifa
 * cercana, salvo en las zonas dibujadas aquí, que cobran la lejana. Fuera de la
 * cobertura no se reparte — eso se dibuja en Configuración y es otra pregunta.
 *
 * La página es un mapa con una lista al lado y no al revés: dibujar es la tarea,
 * la lista solo sirve para nombrar, apagar y comprobar. Por eso el mapa manda en
 * el espacio y la lista es estrecha.
 */
export default function ZonasPage() {
  const [zones, setZones] = useState<ZoneRow[] | null>(null)
  const [coverage, setCoverage] = useState<LatLng[] | null>(null)
  const [center, setCenter] = useState<LatLng>(CENTRO)
  const [bands, setBands] = useState<{ near: number; far: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [z, s] = await Promise.all([
        api.get<ApiEnvelope<ZoneRow[]>>('/admin/delivery-zones'),
        api.get<ApiEnvelope<{ key: string; value: unknown }[]>>('/admin/settings'),
      ])
      setZones(z.data)
      const map = Object.fromEntries(s.data.map((r) => [r.key, r.value])) as Record<string, unknown>
      const poly = (map.coverage_polygon as { polygon?: LatLng[] } | undefined)?.polygon ?? null
      setCoverage(poly)
      const cov = (map.coverage ?? {}) as { centerLat?: number; centerLng?: number }
      setCenter({ lat: cov.centerLat ?? CENTRO.lat, lng: cov.centerLng ?? CENTRO.lng })
      setBands((map.delivery_bands as { near: number; far: number } | undefined) ?? null)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function crear(ring: LatLng[]) {
    setBusy(true)
    setError(null)
    try {
      // Nombre provisional: se dibuja primero y se bautiza después, que es el
      // orden en que la cabeza va — nadie sabe cómo se llama la zona hasta
      // verla trazada.
      const n = (zones?.length ?? 0) + 1
      await api.post('/admin/delivery-zones', { name: `Zona ${n}`, polygon: ring })
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function actualizar(
    id: string,
    patch: Partial<Pick<ZoneRow, 'name' | 'active'>> | { polygon: LatLng[] },
  ) {
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/admin/delivery-zones?id=${id}`, patch)
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
      await api.delete(`/admin/delivery-zones?id=${id}`)
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const shapes: ZoneShape[] = (zones ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    polygon: z.polygon,
    active: z.active,
  }))
  const activas = (zones ?? []).filter((z) => z.active).length

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeader
        eyebrow="Cobertura"
        title="Zonas de cobro"
        description={
          bands
            ? `Dentro de la cobertura se cobra ${soles(bands.near)}. En las zonas dibujadas aquí, ${soles(bands.far)}.`
            : 'Dentro de la cobertura se cobra la tarifa cercana; en estas zonas, la lejana.'
        }
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!coverage && zones !== null && (
        <div className="mb-3 rounded-xl bg-warning-soft p-3 text-[13px] text-amber-900">
          Todavía no hay zona de cobertura dibujada. Dibújala primero en{' '}
          <a className="underline" href="/configuracion">
            Configuración
          </a>{' '}
          — sin ella no se ve contra qué estás delimitando.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <ZonesMap
          coverage={coverage}
          zones={shapes}
          center={center}
          onCreate={crear}
          onEdit={(id, ring) => actualizar(id, { polygon: ring })}
          onDelete={borrar}
          onRename={(id, name) => actualizar(id, { name })}
          onToggle={(id) => {
            const z = zones?.find((x) => x.id === id)
            if (z) actualizar(id, { active: !z.active })
          }}
          busy={busy}
          heightPx={540}
        />

        <div className="t-card">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="t-display text-[15px] text-ink">Zonas lejanas</p>
            <span className="text-[12px] text-ink-muted">{activas} activas</span>
          </div>

          {zones === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-ink/[0.05]" />
          ) : zones.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              Ninguna todavía. Usa la herramienta de polígono en la esquina del mapa para dibujar la
              primera; mientras no haya ninguna, todo el pueblo cobra la tarifa cercana.
            </p>
          ) : (
            <ul className="space-y-2">
              {zones.map((z) => (
                <ZoneRowItem
                  key={z.id}
                  zone={z}
                  busy={busy}
                  onRename={(name) => actualizar(z.id, { name })}
                  onToggle={() => actualizar(z.id, { active: !z.active })}
                  onDelete={() => borrar(z.id)}
                />
              ))}
            </ul>
          )}

          <p className="mt-3 border-ink/[0.06] border-t pt-2 text-[12px] text-ink-muted">
            Para mover una zona ya dibujada, usa el lápiz del mapa y arrastra sus vértices. Se
            guarda al confirmar la edición.
          </p>
        </div>
      </div>
    </div>
  )
}

function ZoneRowItem({
  zone,
  busy,
  onRename,
  onToggle,
  onDelete,
}: {
  zone: ZoneRow
  busy: boolean
  onRename: (name: string) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(zone.name)
  const cambiado = name.trim() !== zone.name && name.trim().length > 0

  return (
    <li className="rounded-xl border border-ink/[0.06] p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${zone.active ? 'bg-red-500' : 'bg-ink/25'}`}
          aria-hidden
        />
        <input
          className={`${fieldSm} min-w-0 flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => cambiado && onRename(name.trim())}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-muted">
        <span>{zone.polygon.length} vértices</span>
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="underline-offset-2 hover:underline"
        >
          {zone.active ? 'Apagar' : 'Encender'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-danger underline-offset-2 hover:underline"
          aria-label={`Borrar ${zone.name}`}
        >
          <Ico.trash className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
