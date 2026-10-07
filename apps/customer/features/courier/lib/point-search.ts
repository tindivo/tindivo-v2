import { LANDMARK_CATEGORY_LABEL, type Landmark } from '@tindivo/map'
import type { CourierEditingPoint, CourierPoint } from '../types'
import { formatPePhone } from './phone'
import { placeReference } from './places'

export interface PointOption {
  key: string
  kind: 'home' | 'recent' | 'place'
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
          contactPhone: me?.phone ?? '',
        },
      })
    }
  }

  for (const r of recents) {
    if (!r.coordinates) continue
    if (q && !fold(`${r.label ?? ''} ${r.contactName} ${r.referenceText}`).includes(q)) continue
    out.push({
      key: `recent:${r.coordinates.lat},${r.coordinates.lng}`,
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
    let n = 0
    for (const l of landmarks) {
      if (n >= MAX_PLACES) break
      if (!fold(l.name).includes(q)) continue
      n += 1
      const name = l.name.trim()
      out.push({
        key: `place:${l.id}`,
        kind: 'place',
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
