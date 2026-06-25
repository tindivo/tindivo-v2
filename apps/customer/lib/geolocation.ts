'use client'

/**
 * Lectura GPS de alta precisión (una sola vez). Fuente única consumida por el botón
 * "Usar mi ubicación" del mapa y por la validación antifraude del checkout.
 * `enableHighAccuracy: true` fuerza el chip GPS (no solo red/wifi); `maximumAge: 0`
 * evita reutilizar una posición cacheada vieja.
 */

export type GeoFix = { lat: number; lng: number; accuracyM: number }
export type GeoErrorCode = 'unavailable' | 'denied' | 'timeout' | 'position_unavailable'

export class GeolocationError extends Error {
  code: GeoErrorCode
  constructor(code: GeoErrorCode) {
    super(code)
    this.name = 'GeolocationError'
    this.code = code
  }
}

export function getCurrentPositionHA(timeoutMs = 15_000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new GeolocationError('unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => {
        const code: GeoErrorCode =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'position_unavailable'
        reject(new GeolocationError(code))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

/** Mensaje en español peruano para cada modo de fallo de geolocalización. */
export function geoErrorMessage(code: GeoErrorCode): string {
  switch (code) {
    case 'denied':
      return 'Activa los permisos de ubicación en tu navegador para usar esta función.'
    case 'timeout':
      return 'No pudimos obtener tu ubicación a tiempo. Intenta de nuevo o mueve el pin.'
    case 'unavailable':
      return 'Tu dispositivo no permite geolocalización. Mueve el pin manualmente.'
    default:
      return 'No pudimos obtener tu ubicación. Mueve el pin manualmente.'
  }
}
