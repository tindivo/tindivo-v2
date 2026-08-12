'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Los umbrales operativos que la tarjeta de la cajera necesita, leídos de
 * `app_settings.timers`.
 *
 * MISMA FILA, MISMA LECTURA, MISMOS NOMBRES QUE `motorizados`. Este hook pedía
 * solo `queueLeadMinutes`; al entrar el reloj de reparto en la tarjeta hacía
 * falta el segundo umbral, y un hook gemelo habría repetido la MISMA consulta
 * por cada tarjeta montada. Van juntos porque salen de la misma fila.
 *
 * Que las dos apps lean el mismo parámetro importa más de lo que parece: si la
 * pantalla de la cajera pintara un reparto en rojo a los 15 minutos y la del
 * motorizado a los 20, las dos estarían discutiendo sobre el mismo pedido con
 * datos distintos, y eso en el piloto se resuelve con una llamada de teléfono.
 *
 * Los defaults duplican los de la base a propósito: si la consulta falla o
 * todavía no volvió, la tarjeta pinta con el mismo criterio que el servidor en
 * vez de con cero.
 */
export interface BusinessTimers {
  /** §23. Margen tras "Pedido listo" antes de escalar a rojo. */
  queueLeadMinutes: number
  /** 0139. A partir de aquí, el reloj de reparto se pone rojo. */
  deliveryLateMinutes: number
}

const DEFAULTS: BusinessTimers = { queueLeadMinutes: 10, deliveryLateMinutes: 20 }

export function useBusinessTimers(): BusinessTimers {
  const [timers, setTimers] = useState<BusinessTimers>(DEFAULTS)

  useEffect(() => {
    getSupabaseBrowser()
      .from('app_settings')
      .select('value')
      .eq('key', 'timers')
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.value as Partial<BusinessTimers> | null
        setTimers({
          queueLeadMinutes:
            typeof v?.queueLeadMinutes === 'number' && v.queueLeadMinutes > 0
              ? v.queueLeadMinutes
              : DEFAULTS.queueLeadMinutes,
          deliveryLateMinutes:
            typeof v?.deliveryLateMinutes === 'number' && v.deliveryLateMinutes > 0
              ? v.deliveryLateMinutes
              : DEFAULTS.deliveryLateMinutes,
        })
      })
  }, [])

  return timers
}

/** Compatibilidad: sigue habiendo llamadas que solo quieren este. */
export function useQueueLeadMinutes(): number {
  return useBusinessTimers().queueLeadMinutes
}
