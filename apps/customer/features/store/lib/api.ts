import type { StoreDetailData, StoreListData, StoreUrlFilters } from '../types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

/** Query string con solo los filtros que tienen valor (URL corta y compartible). */
export function filtersToQuery(f: Partial<StoreUrlFilters>): string {
  const sp = new URLSearchParams()
  if (f.q?.trim()) sp.set('q', f.q.trim())
  if (f.categoria) sp.set('categoria', f.categoria)
  if (f.condicion) sp.set('condicion', f.condicion)
  if (f.orden) sp.set('orden', f.orden)
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** Filtros a partir de la query de la URL (`window.location.search`), con valores saneados. */
export function filtersFromSearch(search: string): StoreUrlFilters {
  const sp = new URLSearchParams(search)
  const condicion = sp.get('condicion') ?? ''
  const orden = sp.get('orden') ?? ''
  return {
    q: (sp.get('q') ?? '').slice(0, 80),
    categoria: sp.get('categoria') ?? '',
    condicion: condicion === 'nuevo' || condicion === 'segunda' ? condicion : '',
    orden: orden === 'precio_asc' || orden === 'precio_desc' ? orden : '',
  }
}

/**
 * Listado desde el SERVIDOR (SSR de /store). `null` si la API no responde: la
 * página pinta un estado de error en vez de romperse.
 */
export async function fetchStoreList(f: Partial<StoreUrlFilters>): Promise<StoreListData | null> {
  try {
    const res = await fetch(`${API_BASE}/public/store${filtersToQuery(f)}`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return null
    return ((await res.json()) as { data: StoreListData }).data
  } catch {
    return null
  }
}

/** Detalle desde el SERVIDOR. `null` = no existe o no es público (404). */
export async function fetchStoreDetail(slug: string): Promise<StoreDetailData | null> {
  try {
    const res = await fetch(`${API_BASE}/public/store/${encodeURIComponent(slug)}`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return null
    return ((await res.json()) as { data: StoreDetailData }).data
  } catch {
    return null
  }
}

/** Listado desde el NAVEGADOR (búsqueda al escribir): sin caché, cancelable. */
export async function fetchStoreListClient(
  f: Partial<StoreUrlFilters>,
  signal?: AbortSignal,
): Promise<StoreListData> {
  const res = await fetch(`${API_BASE}/public/store${filtersToQuery(f)}`, { signal })
  if (!res.ok) throw new Error('store_list_failed')
  return ((await res.json()) as { data: StoreListData }).data
}

export { API_BASE }
