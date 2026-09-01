import type { Category, MenuItem } from '@/features/catalog/types'

/**
 * Búsqueda dentro de la carta de UN negocio.
 *
 * No habla con la API a propósito. `useBusinessCatalog` ya se trae la carta
 * entera en un solo payload (`categories[].items[]`), así que filtrar en el
 * cliente sale gratis: cero latencia, cero debounce, y sigue funcionando con la
 * señal de San Jacinto a media asta. El buscador de la portada
 * (`/public/search`) sí es server-side porque ahí no tenemos los datos.
 *
 * La semántica imita a `search_catalog` (migración 0165) para que los dos
 * buscadores se sientan el mismo: sin tildes, sin mayúsculas, términos de 2+
 * caracteres unidos por AND y en cualquier orden («pollo brasa» encuentra
 * «Pollo a la brasa»).
 */

/** Mismo mínimo que `search_catalog`: por debajo, todo casa con todo. */
export const MIN_QUERY_CHARS = 2

/** Tope de términos, como el `limit 5` del servidor. */
const MAX_TERMS = 5

/**
 * Palabras que NO deben ser obligatorias.
 *
 * Aquí nos separamos de `search_catalog` a propósito. El servidor exige los
 * términos de 2+ caracteres con AND, así que «pizza de pollo» le pide a la
 * carta que contenga «de» y se pierde «Pizza Pollo BBQ». Dentro de una carta,
 * donde el usuario escribe frases enteras («sanguche de cerdo»), esa pérdida se
 * nota. Solo se descartan si queda algo con lo que buscar.
 */
const STOPWORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'para',
  'por',
  'sin',
  'un',
  'una',
  'y',
])

/**
 * Umbral por debajo del cual el buscador estorba: en una carta de 6 platos
 * roba altura de pantalla para resolver un problema que no existe. No va en
 * `app_settings` porque no es un parámetro operativo —la cajera no lo toca—,
 * es una decisión de presentación.
 *
 * Baja de 20/6 a 12/4 porque el corte anterior dejaba un escalón demasiado
 * alto: una carta de 15 platos en 5 secciones ya es larga de recorrer y se
 * quedaba sin buscador. Hoy no cambia a nadie —Al Punto (10 platos, 3
 * secciones) y Pollería Nadia (6 y 3) siguen sin él, y con razón: sus cartas
 * caben de un vistazo—, así que esto es para el negocio que crezca, no para
 * los cuatro de ahora. Lo que sí arregla la falta de costumbre es que el campo
 * ahora se parece al de la portada: no hay gesto nuevo que aprender.
 */
const OFFER_SEARCH_MIN_ITEMS = 12
const OFFER_SEARCH_MIN_CATEGORIES = 4

/** Tramo `[start, end)` del texto ORIGINAL que casó con un término. */
export interface MatchRange {
  start: number
  end: number
}

export interface MenuHit {
  item: MenuItem
  categoryId: string
  categoryName: string
  /** Para resaltar en la tarjeta; ya vienen fusionados y ordenados. */
  nameRanges: MatchRange[]
  descriptionRanges: MatchRange[]
}

/**
 * Normaliza un carácter **conservando su longitud en UTF-16**.
 *
 * Esa invariante es la que permite resaltar: buscamos sobre el texto plegado y
 * pintamos `<mark>` sobre el original usando los mismos índices. Si «á» se
 * plegara a algo de otra longitud, los índices se desalinearían y el resaltado
 * caería medio carácter corrido. Cuando el plegado cambia el tamaño (casos
 * como «İ»), se devuelve el original: preferimos no encontrar esa palabra
 * antes que resaltar donde no es.
 */
function foldChar(ch: string): string {
  const folded = ch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (folded.length === ch.length) return folded
  const lower = ch.toLowerCase()
  return lower.length === ch.length ? lower : ch
}

/** Minúsculas y sin tildes, con la misma longitud que la entrada. */
export function fold(text: string): string {
  return Array.from(text, foldChar).join('')
}

/**
 * Términos buscables de la consulta. Devuelve `[]` cuando no hay nada
 * accionable, que es la señal de «no busques todavía».
 */
export function parseTerms(query: string): string[] {
  const all: string[] = []
  const seen = new Set<string>()
  for (const raw of fold(query).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_QUERY_CHARS || seen.has(raw)) continue
    seen.add(raw)
    all.push(raw)
  }
  const meaningful = all.filter((t) => !STOPWORDS.has(t))
  return (meaningful.length > 0 ? meaningful : all).slice(0, MAX_TERMS)
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length < 2) return ranges
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: MatchRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
      continue
    }
    merged.push({ ...range })
  }
  return merged
}

/** Todas las apariciones de cada término, fusionadas si se solapan. */
function rangesFor(text: string | null, terms: string[]): MatchRange[] {
  if (!text) return []
  const hay = fold(text)
  const ranges: MatchRange[] = []
  for (const term of terms) {
    let from = 0
    while (from <= hay.length - term.length) {
      const at = hay.indexOf(term, from)
      if (at === -1) break
      ranges.push({ start: at, end: at + term.length })
      from = at + term.length
    }
  }
  return mergeRanges(ranges)
}

/** ¿Empieza alguna PALABRA de `hay` por `prefix`? («napo» → «Pizza Napolitana»). */
function wordStartsWith(hay: string, prefix: string): boolean {
  let at = hay.indexOf(prefix)
  while (at > 0) {
    const before = hay[at - 1] ?? ''
    if (!/[\p{L}\p{N}]/u.test(before)) return true
    at = hay.indexOf(prefix, at + 1)
  }
  return at === 0
}

/**
 * Menor es mejor. El orden importa más de lo que parece: con 75 platos, que
 * «pizza americana» salga antes que «gaseosa (va con pizza)» es la diferencia
 * entre un buscador útil y una lista.
 */
function scoreName(foldedName: string, phrase: string, terms: string[]): number {
  if (foldedName === phrase) return 0
  if (foldedName.startsWith(phrase)) return 1
  if (wordStartsWith(foldedName, phrase)) return 2
  if (foldedName.includes(phrase)) return 3
  if (terms.every((t) => foldedName.includes(t))) return 4
  return 5 // solo casó por descripción o por el nombre de la categoría
}

/**
 * Platos de `categories` que casan con `query`, del más relevante al menos.
 * A igualdad de relevancia manda el orden de la carta, que es el que el
 * negocio decidió.
 */
export function searchMenu(categories: Category[], query: string): MenuHit[] {
  const terms = parseTerms(query)
  if (terms.length === 0) return []
  const phrase = fold(query).trim().replace(/\s+/g, ' ')

  const scored: { hit: MenuHit; score: number; order: number }[] = []
  let order = 0

  for (const category of categories) {
    const foldedCategory = fold(category.name)
    for (const item of category.items) {
      const position = order++
      const foldedName = fold(item.name)
      const haystack = `${foldedName} ${item.description ? fold(item.description) : ''} ${foldedCategory}`
      if (!terms.every((term) => haystack.includes(term))) continue
      scored.push({
        score: scoreName(foldedName, phrase, terms),
        order: position,
        hit: {
          item,
          categoryId: category.id,
          categoryName: category.name,
          nameRanges: rangesFor(item.name, terms),
          descriptionRanges: rangesFor(item.description, terms),
        },
      })
    }
  }

  scored.sort((a, b) => a.score - b.score || a.order - b.order)
  return scored.map((s) => s.hit)
}

/** ¿Esta carta es lo bastante grande como para que buscar valga la pena? */
export function shouldOfferSearch(categories: Category[]): boolean {
  if (categories.length >= OFFER_SEARCH_MIN_CATEGORIES) return true
  const items = categories.reduce((total, c) => total + c.items.length, 0)
  return items >= OFFER_SEARCH_MIN_ITEMS
}
