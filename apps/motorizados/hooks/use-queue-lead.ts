'use client'

import { useSyncExternalStore } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Los umbrales operativos que la tarjeta necesita, leídos de
 * `app_settings.timers`.
 *
 * UNA SOLA LECTURA PARA TODOS. Antes esto pedía únicamente `queueLeadMinutes`;
 * al aparecer el segundo umbral, un hook gemelo habría hecho la MISMA consulta
 * otra vez por cada tarjeta montada. Van juntos porque salen de la misma fila.
 *
 * Los defaults duplican los de la base a propósito: si la consulta falla o
 * todavía no volvió, la tarjeta pinta con el mismo criterio que el servidor en
 * vez de con cero.
 */
export interface DriverTimers {
  /** §23. Margen tras "Pedido listo" antes de escalar. */
  queueLeadMinutes: number
  /** 0139. A partir de aquí, el reloj de reparto se pone rojo. */
  deliveryLateMinutes: number
  /**
   * Cuánto espera el motorizado en la puerta antes de poder reportar que el
   * cliente no aparece.
   *
   * Este NO es cosmético: es el umbral que **habilita el botón de no-show**, y
   * `advance_order` valida exactamente el mismo valor contra
   * `arrived_at_customer_at`. Estuvo escrito a mano en `moment-picked-up.tsx`
   * (`5 * 60 * 1000`) mientras el panel admin ya podía cambiarlo, así que
   * subirlo dejaba al motorizado con un botón habilitado que el servidor
   * rechazaba — de pie en la puerta del cliente, con la comida en la mano.
   */
  noShowWaitMinutes: number
}

// Los mismos que aplica la base si la clave falta: `advance_order` usa
// `COALESCE(..., 5)` para el no-show. Si estos dos números dejan de coincidir,
// el front y el servidor discrepan justo cuando la consulta falla.
const DEFAULTS: DriverTimers = {
  queueLeadMinutes: 10,
  deliveryLateMinutes: 20,
  noShowWaitMinutes: 5,
}

// ─────────────────────────────────────────────────────────────────────────────
// UNA CONSULTA PARA TODA LA APP, NO UNA POR TARJETA.
//
// La nota de arriba ya avisaba de que un hook gemelo repetiría la consulta «por
// cada tarjeta montada». El razonamiento era correcto y estaba a medias: evitó
// el hook gemelo, pero no el MONTAJE gemelo. `OrderCard` llama a este hook, así
// que con 6 tarjetas en pantalla salían 6 consultas idénticas a `app_settings`,
// y en `/historial` una por pedido entregado. Medido en dev: 6.
//
// Estos valores cambian cuando alguien toca el panel de admin, o sea casi nunca.
// Se piden UNA vez por sesión y se comparten. No hay realtime ni poll: si el
// ajuste cambia a mitad de turno, entra en el siguiente arranque de la app —
// que es exactamente lo que pasaba antes, porque tampoco había refresco.
// ─────────────────────────────────────────────────────────────────────────────

let snapshot: DriverTimers = DEFAULTS
const listeners = new Set<() => void>()
/** La consulta se lanza una sola vez, aunque monten veinte tarjetas a la vez. */
let cargando = false

function normaliza(v: Partial<DriverTimers> | null): DriverTimers {
  const num = (x: unknown, porDefecto: number) => (typeof x === 'number' && x > 0 ? x : porDefecto)
  return {
    queueLeadMinutes: num(v?.queueLeadMinutes, DEFAULTS.queueLeadMinutes),
    deliveryLateMinutes: num(v?.deliveryLateMinutes, DEFAULTS.deliveryLateMinutes),
    noShowWaitMinutes: num(v?.noShowWaitMinutes, DEFAULTS.noShowWaitMinutes),
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  if (!cargando) {
    cargando = true
    getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'timers')
      .maybeSingle()
      .then(({ data }) => {
        snapshot = normaliza(data?.value as Partial<DriverTimers> | null)
        for (const l of listeners) l()
      })
  }
  return () => {
    listeners.delete(onChange)
    // `cargando` NO se reinicia: los valores ya están en `snapshot` y volver a
    // pedirlos al montar la siguiente tarjeta reintroduciría el problema.
  }
}

export function useDriverTimers(): DriverTimers {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => DEFAULTS,
  )
}

/** Compatibilidad: sigue habiendo llamadas que solo quieren este. */
export function useQueueLeadMinutes(): number {
  return useDriverTimers().queueLeadMinutes
}
