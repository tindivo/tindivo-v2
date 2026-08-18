'use client'

import { useEffect, useState } from 'react'
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

export function useDriverTimers(): DriverTimers {
  const [timers, setTimers] = useState<DriverTimers>(DEFAULTS)

  useEffect(() => {
    getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'timers')
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value as Partial<DriverTimers> | null
        setTimers({
          queueLeadMinutes:
            typeof v?.queueLeadMinutes === 'number' && v.queueLeadMinutes > 0
              ? v.queueLeadMinutes
              : DEFAULTS.queueLeadMinutes,
          deliveryLateMinutes:
            typeof v?.deliveryLateMinutes === 'number' && v.deliveryLateMinutes > 0
              ? v.deliveryLateMinutes
              : DEFAULTS.deliveryLateMinutes,
          noShowWaitMinutes:
            typeof v?.noShowWaitMinutes === 'number' && v.noShowWaitMinutes > 0
              ? v.noShowWaitMinutes
              : DEFAULTS.noShowWaitMinutes,
        })
      })
  }, [])

  return timers
}

/** Compatibilidad: sigue habiendo llamadas que solo quieren este. */
export function useQueueLeadMinutes(): number {
  return useDriverTimers().queueLeadMinutes
}
