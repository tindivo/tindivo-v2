import type { Landmark } from '@tindivo/map'

/**
 * Lo que se le pasa al pedido cuando el punto de recojo es una referencia del
 * pueblo. `directoryBusinessId` va en null: una referencia no es una fila de
 * `directory_businesses` (la columna tiene FK a esa tabla).
 *
 * La referencia del punto necesita ≥ 5 letras (`co_origin_reference_len`):
 * un nombre corto («Posta») se completa para no fallar al final del pedido.
 */
export function placeAsOrigin(place: Landmark) {
  const name = place.name.trim()
  return {
    id: place.id,
    directoryBusinessId: null,
    name,
    lat: place.lat,
    lng: place.lng,
    referenceText: name.length >= 5 ? name : `Frente a ${name}`,
    phone: null,
  }
}
