/**
 * Escape del muro del piloto.
 *
 * Dos formas de levantarlo, y las dos acaban en la misma marca de `localStorage`:
 *   · `?pilot=<token>` — para quien deba entrar sin dar su número.
 *   · Teclear en el muro un celular que esté en `pilot_whitelist`.
 *
 * Esto es conveniencia de UI, no seguridad. Levantar el muro solo deja VER el
 * catálogo; PEDIR sigue exigiendo pasar los gates del API, que se enforcean
 * sobre el teléfono verificado por OTP (`apps/api/lib/pilot/gate.ts`).
 */

/** Token del escape por URL. Sin enlace en la UI: se pasa por fuera. */
export const PILOT_BYPASS_TOKEN = 'sanjacinto-abre-2026'
/** Clave de `localStorage`. La lee también el script inline de `app/layout.tsx`. */
export const PILOT_BYPASS_KEY = 'tindivo.pilot.bypass'
/** Query param del escape por URL. */
export const PILOT_QUERY_PARAM = 'pilot'

/** Marca este dispositivo como autorizado a saltarse el muro. */
export function persistPilotBypass(): void {
  try {
    window.localStorage.setItem(PILOT_BYPASS_KEY, '1')
  } catch {
    // localStorage puede lanzar en modo privado o con cookies bloqueadas. Sin
    // persistir, el muro reaparece en la próxima visita; no rompe nada.
  }
}

/**
 * Resuelve el bypass: mira la URL, y si trae el token válido lo persiste y
 * limpia el query param para que no viaje en capturas ni enlaces compartidos.
 * Devuelve `true` si este dispositivo puede saltarse el muro.
 *
 * Solo cliente: toca `window` y `localStorage`.
 */
export function resolvePilotBypass(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get(PILOT_QUERY_PARAM) === PILOT_BYPASS_TOKEN) {
      persistPilotBypass()
      url.searchParams.delete(PILOT_QUERY_PARAM)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      return true
    }
    return window.localStorage.getItem(PILOT_BYPASS_KEY) === '1'
  } catch {
    return false
  }
}
