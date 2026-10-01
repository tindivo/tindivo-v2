'use client'

import type { MapLandmarkCategory } from '@tindivo/contracts'
import { LANDMARK_CATEGORY_LABEL, type Landmark } from '@tindivo/map'
import { Icon, Spinner } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PlaceCard } from '@/features/courier/components/place-card'
import { PlacesMap } from '@/features/courier/components/places-map'
import { useCourierStatus } from '@/features/courier/hooks/use-courier-status'
import { formatCourierPrice } from '@/features/courier/lib/format'
import { openCourierFlow } from '@/features/courier/lib/open-flow'
import { getLandmarks } from '@/lib/landmarks'

/** Quita tildes y mayúsculas: «Botica» encuentra «BÓTICA», «colegio» encuentra «Colegio». */
function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Lugares de San Jacinto para Tindivo Entregas: negocios de todo tipo,
 * colegios, plazas, iglesias… Salen de `map_landmarks`, las MISMAS
 * referencias que el cliente ve al fijar su punto y el motorizado en su mapa,
 * y que Jesús mantiene desde el admin (`/mapa-referencias`). Antes esta
 * pantalla leía `directory_businesses`, que está vacía: no se veía nada.
 *
 * Tocar uno abre el pedido con ese lugar como punto de recojo.
 */
export default function EntregasLugaresPage() {
  const [places, setPlaces] = useState<Landmark[] | null>(null)
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  const [category, setCategory] = useState<MapLandmarkCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const { status } = useCourierStatus()

  useEffect(() => {
    let on = true
    void getLandmarks().then((rows) => {
      if (on) setPlaces([...rows].sort((a, b) => a.name.localeCompare(b.name, 'es')))
    })
    return () => {
      on = false
    }
  }, [])

  // Solo las categorías que de verdad tienen lugares: un chip que lleva a una
  // lista vacía es un toque perdido.
  const categories = useMemo(() => {
    if (!places) return []
    const present = new Set(places.map((p) => p.category))
    return (Object.keys(LANDMARK_CATEGORY_LABEL) as MapLandmarkCategory[]).filter((c) =>
      present.has(c),
    )
  }, [places])

  const filtered = useMemo(() => {
    if (!places) return null
    const q = plain(query)
    return places.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (q && !plain(p.name).includes(q)) return false
      return true
    })
  }, [places, category, query])

  return (
    <div className="min-h-dvh bg-[#F6F6F5] pb-10">
      <div className="flex flex-col gap-3 bg-white px-4 pt-6 pb-4">
        <div className="flex items-center justify-between pl-14 md:pl-0">
          <div>
            <div className="text-[30px] font-extrabold tracking-[-0.035em] text-[#2E3236]">
              Lugares
            </div>
            <div className="mt-0.5 text-[14px] font-medium text-[#5C6368]">San Jacinto</div>
          </div>
          <div className="flex shrink-0 gap-0.5 rounded-full bg-[#2E3236]/[0.06] p-[3px]">
            <button
              type="button"
              onClick={() => setView('lista')}
              className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold ${
                view === 'lista'
                  ? 'bg-white text-[#2E3236] shadow-[0_1px_3px_rgba(46,50,54,.14)]'
                  : 'text-[#5C6368]'
              }`}
            >
              <Icon name="list" size={18} filled={view === 'lista'} className="text-[#1D4ED8]" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setView('mapa')}
              className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold ${
                view === 'mapa'
                  ? 'bg-white text-[#2E3236] shadow-[0_1px_3px_rgba(46,50,54,.14)]'
                  : 'text-[#5C6368]'
              }`}
            >
              <Icon name="map" size={18} />
              Mapa
            </button>
          </div>
        </div>

        <label className="flex h-13 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)]">
          <Icon name="search" size={22} className="text-[#5C6368]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca una botica, un colegio, una tienda…"
            className="h-12 w-full border-0 bg-transparent text-[16px] font-semibold text-[#2E3236] outline-none"
          />
        </label>

        {categories.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {(['all', ...categories] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`h-11 shrink-0 rounded-full px-4 text-[15px] font-bold ${
                  category === c ? 'bg-[#2E3236] text-white' : 'bg-[#F4F4F2] text-[#2E3236]'
                }`}
              >
                {c === 'all' ? 'Todos' : LANDMARK_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}
      </div>

      {status.enabled && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-[20px] bg-[#EEF3FF] p-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[linear-gradient(150deg,#4F8BFF,#1D4ED8)] shadow-[inset_0_1px_0_rgba(255,255,255,.22)]">
            <Icon name="two_wheeler" size={25} filled className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold text-[#2E3236]">Tindivo Entregas</div>
            <div className="text-[13px] font-medium leading-tight text-[#5C6368]">
              Recogemos lo que ya pagaste y lo llevamos. {formatCourierPrice(status.price)}.
            </div>
          </div>
        </div>
      )}

      {view === 'mapa' ? (
        <div role="dialog" aria-label="Mapa de lugares" className="fixed inset-0 z-30 bg-white">
          {filtered === null ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="md" variant="brand" />
            </div>
          ) : (
            <PlacesMap places={filtered} />
          )}
          {/* Este mapa tapa la pantalla completa (cabecera incluida) a
              cualquier ancho: la flecha es la única salida, también en escritorio. */}
          <button
            type="button"
            onClick={() => setView('lista')}
            aria-label="Volver a la lista"
            className="fixed top-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(46,50,54,.25)]"
          >
            <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
          </button>
        </div>
      ) : filtered === null ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" variant="brand" />
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pt-4 md:grid md:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[14px] text-[#5C6368] md:col-span-full">
              {places?.length === 0
                ? 'Todavía no hay lugares cargados.'
                : 'No encontramos lugares con ese filtro.'}
            </p>
          )}
          {filtered.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}

          <div className="flex flex-col gap-3.5 rounded-[24px] bg-[#EEF3FF] p-4 pt-5 md:col-span-full">
            <div>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
                ¿No está en la lista?
              </div>
              <div className="mt-0.5 text-[14px] font-medium text-[#5C6368]">
                Marca el punto en el mapa y lo recogemos.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openCourierFlow()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(150deg,#4F8BFF,#1D4ED8)] text-[17px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,.55)]"
            >
              <Icon name="pin_drop" size={22} filled />
              Otro lugar o persona
            </button>
          </div>
        </div>
      )}

      {view === 'lista' && (
        <Link
          href="/"
          className="fixed top-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(46,50,54,.25)] md:hidden"
          aria-label="Volver al inicio"
        >
          <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
        </Link>
      )}
    </div>
  )
}
