import { LANDMARK_CATEGORY_LABEL, type Landmark } from '@tindivo/map'
import type { CourierEditingPoint, CourierPoint } from '../types'
import { formatPePhone, stripPeCountryCode } from './phone'
import { placeReference } from './places'

export interface PointOption {
  key: string
  /** `business`: un negocio del pueblo; `place`: una referencia pública (plaza, colegio…). */
  kind: 'home' | 'recent' | 'business' | 'place'
  title: string
  subtitle: string
  /** Solo en los lugares: para pintar la misma chapa que en el mapa. */
  category?: Landmark['category']
  /** Lo que se escribe en el punto al elegirla. */
  point: Partial<CourierPoint> & {
    coordinates: { lat: number; lng: number }
    referenceText: string
  }
}

const MAX_PLACES = 8

/**
 * Qué categorías son NEGOCIOS: de donde se recoge. El resto (plaza, colegio,
 * losa, iglesia, la posta…) son referencias para ubicarse: se pueden buscar,
 * pero salen después. `salud` es lo público (posta, Essalud) desde que las
 * boticas tienen `farmacia`, y `otro` es la bolsa de lo que no es negocio
 * desde que los negocios tienen `comercio` (0246).
 */
const BUSINESS: ReadonlySet<Landmark['category']> = new Set([
  'farmacia',
  'mercado',
  'restaurante',
  'hotel',
  'comercio',
])

/**
 * Buscar también por TIPO: «botica» trae Inkafarma, «pollo» trae las
 * pollerías. Hace de filtro sin chips (que con el teclado abierto le quitaban
 * espacio a los resultados; `Docs/Entregas/ux-entrada/08`).
 */
const TYPE_WORDS: Partial<Record<Landmark['category'], readonly string[]>> = {
  farmacia: ['botica', 'farmacia', 'medicina'],
  salud: ['salud', 'posta', 'essalud', 'hospital'],
  mercado: ['bodega', 'tienda', 'mercado', 'minimarket', 'abarrotes', 'licoreria'],
  restaurante: [
    'restaurante',
    'restaurant',
    'pollo',
    'polleria',
    'pizza',
    'comida',
    'cevicheria',
    'chifa',
  ],
  hotel: ['hotel', 'hospedaje', 'hostal'],
  comercio: ['libreria', 'grifo', 'pasteleria', 'panaderia', 'comercio', 'spa', 'bar'],
  educacion: ['colegio', 'escuela', 'institucion', 'educacion'],
  recreacion: ['parque', 'plaza'],
  deporte: ['losa', 'cancha', 'coliseo', 'deporte'],
  religioso: ['iglesia', 'capilla'],
}

/**
 * «bot» ya cuenta como «botica»; «boticas» también. Solo con UNA palabra: una
 * consulta como «Restaurant La Florencia» es un nombre, no un tipo, y antes
 * traía todos los restaurantes y dejaba La Florencia fuera de los 5 primeros.
 */
function matchesType(category: Landmark['category'], q: string): boolean {
  if (q.length < 3 || q.includes(' ')) return false
  return (TYPE_WORDS[category] ?? []).some(
    (w) => w.startsWith(q) || q === `${w}s` || q === `${w}es`,
  )
}

/** «Botica» encuentra «BÓTICA»; «colegio» encuentra «Colegio». */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Las sugerencias de la lupa del pin, en el orden en que conviene verlas.
 *
 * - **Sin escribir nada:** «Mi dirección» (solo al fijar la entrega: lo normal
 *   es que llegue a casa de quien pide) y los sitios recientes. Los lugares del
 *   pueblo NO: son 60, en su mayoría canchas e iglesias, y una lista entera
 *   antes de escribir es ruido.
 * - **Escribiendo:** lo mismo filtrado, y debajo los lugares que coinciden.
 *
 * Cada sugerencia REEMPLAZA el contacto del punto, no lo mezcla: un reciente
 * trae el suyo (quién estaba ahí), «Mi dirección» trae a quien pide, y un
 * lugar lo deja vacío (un colegio no es quien entrega). Si no, elegir el
 * colegio después de «María» dejaba el celular de María en el colegio.
 */
export function searchPoints({
  query,
  which,
  landmarks,
  recents,
  home,
  me = null,
}: {
  query: string
  which: CourierEditingPoint
  landmarks: readonly Landmark[]
  recents: readonly CourierPoint[]
  home: { referenceText: string; coordinates: { lat: number; lng: number } } | null
  /** Quien pide: «Mi dirección» lo pone como contacto. */
  me?: { name: string; phone: string } | null
}): PointOption[] {
  const q = fold(query)
  const out: PointOption[] = []

  if (home && which === 'destination') {
    const words = fold(`mi direccion casa ${home.referenceText}`)
    if (!q || words.includes(q)) {
      out.push({
        key: 'home',
        kind: 'home',
        title: 'Mi dirección',
        subtitle: home.referenceText,
        point: {
          ...home,
          label: 'Mi dirección',
          contactName: me?.name ?? '',
          // Sin `+51`: el perfil lo guarda a veces con prefijo y «Soy yo»
          // compara los 9 dígitos.
          contactPhone: me ? stripPeCountryCode(me.phone) : '',
        },
      })
    }
  }

  for (const [i, r] of recents.entries()) {
    if (!r.coordinates) continue
    if (q && !fold(`${r.label ?? ''} ${r.contactName} ${r.referenceText}`).includes(q)) continue
    out.push({
      // Con el índice: dos vecinos pueden compartir el mismo punto exacto (la
      // deduplicación ya no los funde si son personas distintas).
      key: `recent:${i}`,
      kind: 'recent',
      title: r.label || r.referenceText,
      // Con el celular: dos «Botica Central» se distinguen por quién atiende.
      subtitle: [r.referenceText, r.contactPhone ? formatPePhone(r.contactPhone) : '']
        .filter(Boolean)
        .join(' · '),
      point: { ...r, coordinates: r.coordinates },
    })
  }

  if (q) {
    // Primero lo que coincide por NOMBRE (lo que la persona escribió de
    // verdad), después lo que solo coincide por tipo; en cada tanda, los
    // negocios antes que las referencias.
    const byName = landmarks.filter((l) => fold(l.name).includes(q))
    const byType = landmarks.filter((l) => !byName.includes(l) && matchesType(l.category, q))
    const business = (ls: readonly Landmark[]) => ls.filter((l) => BUSINESS.has(l.category))
    const others = (ls: readonly Landmark[]) => ls.filter((l) => !BUSINESS.has(l.category))
    const sorted = [
      ...business(byName),
      ...business(byType),
      ...others(byName),
      ...others(byType),
    ].slice(0, MAX_PLACES)
    for (const l of sorted) {
      const name = l.name.trim()
      out.push({
        key: `place:${l.id}`,
        kind: BUSINESS.has(l.category) ? 'business' : 'place',
        title: name,
        subtitle: LANDMARK_CATEGORY_LABEL[l.category],
        category: l.category,
        point: {
          coordinates: { lat: l.lat, lng: l.lng },
          referenceText: placeReference(name),
          label: name,
          contactName: '',
          contactPhone: '',
        },
      })
    }
  }

  return out
}
