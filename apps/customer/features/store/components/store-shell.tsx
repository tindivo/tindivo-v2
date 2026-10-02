'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchStoreListClient, filtersFromSearch, filtersToQuery } from '../lib/api'
import { captureRef, markFromList, trackStore } from '../lib/tracking'
import type { StoreCard, StoreListData, StoreUrlFilters } from '../types'
import { EmptyState } from './empty-state'
import { FilterSheet } from './filter-sheet'
import { ProductCard } from './product-card'
import { HowItWorks, StoreHeader, StoreHero } from './store-chrome'

const SEARCH_DEBOUNCE_MS = 300
const PRIORITY_CARDS = 2
const SUGGESTIONS = 4

/**
 * /store: header, hero, buscador con filtros, categorías, grilla, «Vendidos
 * recientemente» y «Cómo funciona».
 *
 * Los filtros viven en la URL (`?categoria=ropa&condicion=segunda&orden=…`)
 * para poder compartirlos y volver a ellos desde un detalle. Se escribe con
 * `history.replaceState` y NO con `router.replace`: este último vuelve a pedir
 * la página al servidor en cada tecla, y la búsqueda ya filtra sola en el
 * cliente contra la API.
 */
export function StoreShell({
  initial,
  initialFilters,
}: {
  initial: StoreListData | null
  initialFilters: StoreUrlFilters
}) {
  const [filters, setFilters] = useState(initialFilters)
  const [data, setData] = useState<StoreListData | null>(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(initial === null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<StoreCard[]>([])
  const firstRun = useRef(true)
  const lastQ = useRef(initialFilters.q)

  const hasFilters = filters.condicion !== '' || filters.orden !== ''
  const searching = filters.q.trim().length > 0

  // La URL real manda. Al volver desde un detalle, el router puede remontar esta
  // vista con las props de otra visita (sin filtros) aunque la barra de
  // direcciones siga diciendo `?categoria=ropa`: se sincroniza con lo que el
  // comprador ve en la URL, que es lo que espera encontrar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al montar
  useEffect(() => {
    const fromUrl = filtersFromSearch(window.location.search)
    if (filtersToQuery(fromUrl) !== filtersToQuery(initialFilters)) setFilters(fromUrl)
  }, [])

  useEffect(() => {
    captureRef()
    trackStore('view_list')
    if (initialFilters.q.trim().length >= 2) {
      trackStore('search', { searchTerm: initialFilters.q.trim() })
    }
  }, [initialFilters.q])

  // Cada cambio de filtros: URL compartible + datos nuevos de la API.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const qChanged = lastQ.current !== filters.q
    lastQ.current = filters.q
    const ctrl = new AbortController()
    const timer = setTimeout(
      () => {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${filtersToQuery(filters)}`,
        )
        setBusy(true)
        fetchStoreListClient(filters, ctrl.signal)
          .then((d) => {
            setData(d)
            setFailed(false)
            if (qChanged && filters.q.trim().length >= 2) {
              trackStore('search', { searchTerm: filters.q.trim() })
            }
          })
          .catch((e: unknown) => {
            if ((e as Error).name !== 'AbortError') setFailed(true)
          })
          .finally(() => setBusy(false))
      },
      qChanged ? SEARCH_DEBOUNCE_MS : 0,
    )
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [filters])

  const empty = data !== null && data.products.length === 0

  // «Mientras tanto»: cuando no hay resultados, 4 disponibles del catálogo completo.
  useEffect(() => {
    if (!empty) return
    let cancelled = false
    fetchStoreListClient({})
      .then((d) => {
        if (!cancelled) setSuggestions(d.products.slice(0, SUGGESTIONS))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [empty])

  const base = useMemo(
    () => ({ q: filters.q, categoria: filters.categoria }),
    [filters.q, filters.categoria],
  )
  const current = useMemo(
    () => ({ condicion: filters.condicion, orden: filters.orden }),
    [filters.condicion, filters.orden],
  )

  const openFilters = useCallback(() => {
    trackStore('filter_open')
    setSheetOpen(true)
  }, [])

  return (
    <>
      <StoreHeader />
      {data && <StoreHero settings={data.settings} />}

      <div className="st-search">
        <div className="st-box" role="search">
          <Icon name="search" size={22} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Busca casaca, 38, perfume…"
            aria-label="Buscar en la tienda"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          {searching && (
            <button
              type="button"
              className="st-clr"
              aria-label="Borrar búsqueda"
              onClick={() => setFilters((f) => ({ ...f, q: '' }))}
            >
              <span>
                <Icon name="close" size={17} />
              </span>
            </button>
          )}
          <button
            type="button"
            className="st-fb"
            aria-label={hasFilters ? 'Filtros (hay filtros activos)' : 'Filtros'}
            aria-pressed={hasFilters}
            onClick={openFilters}
          >
            <Icon name="tune" size={22} />
            {hasFilters && <i aria-hidden="true" />}
          </button>
        </div>
      </div>

      {data && data.categories.length > 0 && (
        <nav className="st-chips" aria-label="Categorías">
          <button
            type="button"
            className="st-chip"
            aria-pressed={filters.categoria === ''}
            onClick={() => setFilters((f) => ({ ...f, categoria: '' }))}
          >
            <Icon name="apps" filled={filters.categoria === ''} />
            Todo <em>{data.totalAvailable}</em>
          </button>
          {data.categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="st-chip"
              aria-pressed={filters.categoria === c.slug}
              onClick={() => setFilters((f) => ({ ...f, categoria: c.slug }))}
            >
              <Icon name={c.icon} filled={filters.categoria === c.slug} />
              {c.name} <em>{c.count}</em>
            </button>
          ))}
        </nav>
      )}

      <main className={busy ? 'st-busy' : undefined} aria-busy={busy}>
        {failed && data === null && (
          <div className="st-empty">
            <div className="st-empty-ico">
              <Icon name="cloud_off" size={28} />
            </div>
            <h2>No pudimos cargar la tienda</h2>
            <p>Revisa tu conexión e inténtalo otra vez.</p>
            <button type="button" className="st-cta" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        )}

        {data && !empty && (
          <div className="st-grid">
            {data.products.map((c, i) => (
              <ProductCard
                key={c.id}
                card={c}
                priority={i < PRIORITY_CARDS}
                onOpen={markFromList}
              />
            ))}
          </div>
        )}

        {data && empty && (
          <EmptyState
            term={searching ? filters.q.trim() : 'algo que no encontré'}
            whatsappNumber={data.settings.whatsappNumber}
            suggestions={suggestions}
            onContact={() => trackStore('click_whatsapp', { searchTerm: filters.q.trim() || null })}
          />
        )}

        {data && data.sold.length > 0 && !searching && (
          <section aria-labelledby="st-sold-t">
            <div className="st-sold-t" id="st-sold-t">
              Vendidos recientemente
            </div>
            <div className="st-sold-s">Así de rápido se van las oportunidades.</div>
            <div className="st-gsold">
              {data.sold.map((c) => (
                <ProductCard key={c.id} card={c} variant="sold" onOpen={markFromList} />
              ))}
            </div>
          </section>
        )}
      </main>

      <HowItWorks />
      <div className="st-foot">
        <Link href="/" className="st-rest" onClick={() => trackStore('nav_out')}>
          <Icon name="restaurant" size={20} />
          Ver restaurantes de Tindivo
          <Icon name="chevron_right" size={20} />
        </Link>
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        current={current}
        base={base}
        onApply={(d) => {
          trackStore('filter_apply')
          setFilters((f) => ({ ...f, ...d }))
        }}
      />
    </>
  )
}
