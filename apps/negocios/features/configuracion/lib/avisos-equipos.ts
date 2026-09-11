import type { PushDevice } from '@/hooks/use-push-status'

/**
 * CÓMO SE LE LLAMA A CADA APARATO DELANTE DE UNA PERSONA.
 *
 * La plataforma la deduce el backend del HOST DEL ENDPOINT, no del `user_agent`:
 * Safari solo habla con Apple y Chrome solo con FCM, así que no se puede
 * falsear desde la página. Ver `plataformaDe` en la ruta de push.
 *
 * Deliberadamente vago en `apple`: el endpoint dice que es de Apple, no si es
 * un iPhone, un iPad o un Mac. Poner «iPhone» sería más bonito y a veces falso,
 * y esta lista existe justamente para que la dueña decida qué apagar mirándola.
 *
 * LOS ICONOS SALEN DEL SUBSET CERRADO de `public/fonts/icons.txt`, que no trae
 * `computer` ni `phone_iphone`. No es una limitación grave —la etiqueta lleva la
 * diferencia y el icono solo tiene que separar «celular» de «no celular»— y
 * regenerar el `.woff2` por dos glifos costaría más de lo que aporta.
 */
export const PLATAFORMA: Record<PushDevice['platform'], { label: string; icon: string }> = {
  apple: { label: 'iPhone o iPad', icon: 'smartphone' },
  android: { label: 'Android', icon: 'smartphone' },
  windows: { label: 'Computadora con Windows', icon: 'devices' },
  otro: { label: 'Otro navegador', icon: 'devices' },
}

const diaLima = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Lima',
})

/** «12 ago». Sin hora: para «desde cuándo» la hora no aporta nada. */
export function dia(iso: string): string {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? diaLima.format(t) : '—'
}

/**
 * «hace 3 días», «hace 2 h», «hace un momento», o `null` si nunca recibió uno.
 *
 * Relativo y no una fecha exacta a propósito: lo que se decide con este dato es
 * «¿este aparato sigue en uso?», y para eso «hace 40 días» se lee de un vistazo
 * y «22 jul» hay que restarlo mentalmente.
 *
 * CUIDADO CON LO QUE MIDE: es el último aviso ENTREGADO, no el último uso. Un
 * celular olvidado en un cajón del local sigue aceptando entregas y aparece
 * igual de fresco que la tablet del mostrador. Por eso decide la persona y no
 * una regla de fechas.
 */
export function desde(iso: string | null, ahora: number): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const min = Math.floor((ahora - t) / 60_000)
  if (min < 2) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}
