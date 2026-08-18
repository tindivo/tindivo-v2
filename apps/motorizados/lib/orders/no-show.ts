/**
 * La cuenta atrás de «el cliente no aparece».
 *
 * Vive aquí y no dentro del componente porque **decide si un botón se habilita**,
 * no solo qué se pinta: mientras `canReport` sea falso el motorizado no puede
 * reportar el no-show, y `advance_order` valida por su cuenta el mismo umbral
 * contra `arrived_at_customer_at`. Las dos reglas tienen que dar el mismo
 * resultado, y una regla que hay que comprobar necesita poder probarse sin
 * montar la pantalla.
 *
 * El umbral entra como parámetro, nunca como constante: sale de
 * `app_settings.timers.noShowWaitMinutes` y el panel admin lo ofrece como
 * «Espera no-show (min)». Estuvo escrito a mano aquí con un 5, así que subirlo
 * desde el panel habilitaba el botón antes de tiempo y el servidor lo rechazaba.
 */
export interface NoShowCountdown {
  /** Segundos que faltan. 0 cuando ya se puede reportar. */
  remainingSec: number
  /** `m:ss` para pintar. */
  formatted: string
  /** Si el botón de no-show debe estar habilitado. */
  canReport: boolean
}

export function computeNoShowCountdown(
  arrivedAtCustomerAt: string | null | undefined,
  noShowWaitMinutes: number,
  now: number,
): NoShowCountdown {
  const arrivedAt = arrivedAtCustomerAt ? Date.parse(arrivedAtCustomerAt) : null

  // Sin marca de llegada no hay cuenta atrás, y sobre todo no hay reporte: el
  // servidor exige «Primero marca que llegaste al domicilio». Un `arrivedAt`
  // inválido (fecha corrupta) cae aquí también, en vez de producir un NaN que
  // haría `remainingMs === 0` y habilitaría el botón por accidente.
  if (arrivedAt === null || Number.isNaN(arrivedAt)) {
    return { remainingSec: 0, formatted: '0:00', canReport: false }
  }

  const deadline = arrivedAt + noShowWaitMinutes * 60 * 1000
  const remainingSec = Math.ceil(Math.max(0, deadline - now) / 1000)
  const minutes = Math.floor(remainingSec / 60)
  const seconds = remainingSec % 60

  return {
    remainingSec,
    formatted: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    canReport: remainingSec === 0,
  }
}
