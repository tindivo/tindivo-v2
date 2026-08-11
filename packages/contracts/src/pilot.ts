/**
 * Piloto cerrado: la única definición de cuándo se abre Tindivo al público.
 *
 * Vive en `contracts` porque la consumen dos proyectos que no se importan entre
 * sí: `apps/api` (los dos gates de enforcement) y `apps/customer` (el muro con
 * countdown). Duplicar la fecha sería garantizar que un día discrepen.
 *
 * El corte es automático. Pasado `PILOT_LAUNCH_AT` no hay deploy que hacer ni
 * flag que apagar: `isPilotActive()` devuelve `false`, los gates dejan de
 * consultar `pilot_whitelist` y el muro deja de renderizarse.
 */

/**
 * Lanzamiento público: viernes 14 de agosto de 2026, 18:00 de Lima (UTC-5).
 *
 * Se declara en UTC a propósito. Perú no tiene horario de verano, pero fijar el
 * instante en Z lo deja inmune al huso del servidor que evalúe la comparación.
 */
export const PILOT_LAUNCH_AT = new Date('2026-08-14T23:00:00Z')

/**
 * `true` mientras el piloto siga cerrado (whitelist vigente).
 *
 * `now` es inyectable para poder simular el reloj en tests sin tocar globales.
 */
export function isPilotActive(now: Date = new Date()): boolean {
  return now.getTime() < PILOT_LAUNCH_AT.getTime()
}

/**
 * Formulario externo de solicitud de acceso al piloto.
 *
 * Aquí y no en `apps/api` porque lo usan los dos lados: el mensaje de rechazo de
 * la API y el muro de la portada.
 */
export const PILOT_FORM_URL = 'https://forms.gle/BNDEMXSmpTJD6Fna8'
