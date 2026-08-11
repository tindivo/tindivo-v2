'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Los umbrales operativos que la tarjeta necesita, leídos de
 * `app_settings.timers`.
 *
 * UNA SOLA LECTURA PARA LOS DOS. Antes esto pedía únicamente
 * `queueLeadMinutes`; al aparecer el segundo umbral, un hook gemelo habría
 * hecho la MISMA consulta otra vez por cada tarjeta montada. Van juntos porque
 * salen de la misma fila.
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
}

const DEFAULTS: DriverTimers = { queueLeadMinutes: 10, deliveryLateMinutes: 20 }

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
        })
      })
  }, [])

  return timers
}

/** Compatibilidad: sigue habiendo llamadas que solo quieren este. */
export function useQueueLeadMinutes(): number {
  return useDriverTimers().queueLeadMinutes
}
