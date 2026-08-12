/**
 * Constantes geográficas de San Jacinto.
 *
 * Pedidas por `Docs/spec/PENDIENTES.md §4` ("CREAR, no existen en v2").
 */

/**
 * Centro del pueblo. Es la MEDIANA medida de las 351 direcciones con GPS del
 * directorio, no un punto elegido a ojo.
 *
 * ⚠️ SIRVE PARA CENTRAR EL MAPA CUANDO NO HAY COORDENADA PREVIA. NUNCA COMO
 *    FALLBACK CUANDO EL GPS FALLA.
 *
 *    Esa confusión es exactamente lo que produjo las 18 direcciones falsas del
 *    legacy: al fallar el sensor plantaba el pin en el centro y dejaba el botón
 *    de confirmar habilitado, así que 18 casas quedaron registradas en mitad
 *    del pueblo — y una de ellas acumuló 9 entregas antes de que nadie lo
 *    notara. Centrar el mapa es decir "mirá por aquí"; guardar es otra cosa, y
 *    exige un gesto de una persona.
 */
export const SAN_JACINTO_CENTER = { lat: -9.148104, lng: -78.280353 } as const

/** Zoom al que se ve el pueblo entero sin perder las calles. */
export const SAN_JACINTO_DEFAULT_ZOOM = 15

/**
 * Caja de cobertura, la misma que el CHECK `address_directory_coords_bbox`
 * (0122) y la que valida el RPC de captura (0147).
 *
 * Es una frontera dura: rechaza TODA coordenada fuera, sea basura o no. Se
 * comprueba en el cliente para poder decirlo antes de gastar un viaje al
 * servidor, no para sustituir la validación de la base.
 */
export const SAN_JACINTO_BBOX = {
  latMin: -9.2,
  latMax: -9.1,
  lngMin: -78.33,
  lngMax: -78.23,
} as const

export function isInsideCoverage(lat: number, lng: number): boolean {
  return (
    lat >= SAN_JACINTO_BBOX.latMin &&
    lat <= SAN_JACINTO_BBOX.latMax &&
    lng >= SAN_JACINTO_BBOX.lngMin &&
    lng <= SAN_JACINTO_BBOX.lngMax
  )
}

/** Metros entre dos puntos (Haversine). Se usa para saber cuánto se alejó el
 *  pin del punto que dio el GPS, que es la señal de que ya no es una medición
 *  del sensor sino una decisión de la persona. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (x: number) => (x * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)))
}
