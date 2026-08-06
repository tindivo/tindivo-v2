'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface DeliveryBands {
  near: number
  far: number
}

/**
 * Tarifas de envío por banda, leídas de `app_settings.delivery_bands`.
 *
 * SE LEEN, NO SE HARDCODEAN. Es la misma fuente que usa `create_business_manual_order`
 * para calcular el envío desde la 0126, así que lo que ve la cajera en los
 * botones es exactamente lo que se va a cobrar. Si mañana cambian las tarifas
 * en el panel de admin, esta pantalla las refleja sin tocar código.
 *
 * La lectura va DIRECTA al browser client, sin endpoint intermedio: la policy
 * `as_public_read` de `app_settings` incluye `delivery_bands` en su lista
 * blanca (verificado contra prod). Ojo con la simetría — `commissions` NO está
 * en esa lista, y está bien que no lo esté: la cajera ve lo que paga el
 * cliente, no lo que cobra Tindivo.
 *
 * Mismo patrón que `features/pedidos/hooks/use-support-phone.ts`. No se extrae
 * a un lugar común todavía: son dos usos, y la regla del repo es no abstraer
 * antes del tercero.
 *
 * FALLAR AQUÍ NO BLOQUEA NADA. Si la consulta falla o tarda, `bands` queda en
 * `null` y el selector muestra los botones sin monto. La zona se puede elegir
 * igual: el precio lo calcula el backend, no esta pantalla.
 */
export function useDeliveryBands(): { bands: DeliveryBands | null; loading: boolean } {
  const [bands, setBands] = useState<DeliveryBands | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowser()

    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'delivery_bands')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const value = data?.value as { near?: number; far?: number } | null | undefined
        if (typeof value?.near === 'number' && typeof value?.far === 'number') {
          setBands({ near: value.near, far: value.far })
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { bands, loading }
}
