'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ventasPerdidasSinAvisar } from '@/lib/orders/lost-sales'
import type { OrderVM } from '@/lib/orders/view-model'

const STORAGE_KEY = 'tindivo_ventas_perdidas_avisadas'

/**
 * Techo de avisos guardados. Las ventas perdidas son raras —seis en sesenta
 * días en todo el piloto— así que treinta cubre meses. El techo está por lo
 * mismo que en el resto del panel: esto corre en una tablet que no se cierra
 * nunca, y una lista que solo crece acaba tirando la escritura entera.
 */
const MAX_AVISADAS = 30

/**
 * QUÉ VENTAS PERDIDAS QUEDAN POR ENSEÑAR.
 *
 * Se guarda lo YA ENSEÑADO y no lo pendiente, y esa es la decisión que hace que
 * esto funcione al recargar: el tablero vuelve a traer los cancelados de la
 * jornada en cada carga (ver `fetchOrdersQuery`), así que si guardáramos lo
 * pendiente se perdería con la recarga y el aviso no llegaría nunca. Guardando
 * lo visto, un aviso que la cajera no llegó a leer —porque el panel se recargó
 * con un despliegue, o se fue la red— sigue esperándola cuando vuelve.
 *
 * NO SE PODA CONTRA LO VIVO, al revés que `useAcknowledged`. Aquí no hay estado
 * que cambie: un pedido cancelado por no atenderlo ya no se mueve más. Basta el
 * techo de `MAX_AVISADAS`.
 *
 * VIVE EN ESTE APARATO. Si abren el panel en otro celular, ahí el aviso vuelve a
 * salir. Para una noticia como esta es lo correcto: quien esté delante del
 * mostrador tiene que enterarse, aunque otro ya lo supiera.
 */
export function useLostSales(vms: readonly OrderVM[]): {
  /** Las que hay que enseñar AHORA, de la más antigua a la más reciente. */
  pending: OrderVM[]
  /** Las da por vistas todas. Lo llama el botón del aviso. */
  dismiss: () => void
} {
  const [avisadas, setAvisadas] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
    } catch {
      // Un `localStorage` ilegible no puede impedir que el tablero arranque.
      return []
    }
  })

  const vistas = useMemo(() => new Set(avisadas), [avisadas])
  const pending = useMemo(() => ventasPerdidasSinAvisar(vms, vistas), [vms, vistas])

  const dismiss = useCallback(() => {
    // Se cierran TODAS las que estaban a la vista, no la primera: el aviso las
    // enseña juntas y cerrarlo significa «ya las vi», en plural.
    const ids = pending.map((o) => o.rowId)
    if (ids.length === 0) return
    setAvisadas((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))].slice(-MAX_AVISADAS))
  }, [pending])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(avisadas))
    } catch {
      // Cuota llena o incógnito: el aviso volverá a salir tras recargar. Peor
      // UX, cero riesgo: repetir esta noticia no pierde ninguna venta.
    }
  }, [avisadas])

  return { pending, dismiss }
}
