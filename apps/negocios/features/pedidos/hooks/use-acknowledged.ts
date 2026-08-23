'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { attentionKey } from '@/lib/orders/attention'
import type { OrderVM } from '@/lib/orders/view-model'

const STORAGE_KEY = 'tindivo_acked_orders'

/**
 * Techo de acuses guardados. No es una optimización: es que este panel corre en
 * una tablet que no se cierra nunca, y una lista que solo crece acaba llenando
 * la cuota de `localStorage` y tirando la escritura entera —o sea, dejando de
 * guardar acuses justo el día que más pedidos hubo—.
 */
const MAX_ACUSES = 40

/**
 * LA PODA, Y POR QUÉ NO PUEDE CORRER CON EL TABLERO VACÍO.
 *
 * Tira los acuses de situaciones que ya no existen. La primera versión lo hacía
 * sin más, y con eso se comía a sí misma: al montar, `rows` arranca en `[]`
 * —los pedidos llegan por la consulta, un instante después—, así que el primer
 * pase encontraba CERO claves vivas y borraba todos los acuses recién leídos de
 * `localStorage`. El efecto era que el acuse no sobrevivía a una recarga: la
 * cajera volvía de un F5 (o de un despliegue) y la tanda de bips empezaba otra
 * vez por pedidos que ya había visto. Justo el castigo que hace que alguien
 * apague las alertas.
 *
 * Sin claves vivas no hay información para podar. No es que no quede nada: es
 * que todavía no sabemos nada. Y la lista no crece sin techo aunque el tablero
 * se pase la noche vacío, porque `MAX_ACUSES` la corta al insertar.
 */
export function pruneAcks(keys: readonly string[], vivas: ReadonlySet<string>): string[] {
  if (vivas.size === 0) return [...keys]
  return keys.filter((k) => vivas.has(k))
}

/**
 * EL ACUSE DE RECIBO DE LA CAJERA: «YA LO VI».
 *
 * Guarda qué pedidos ha abierto, para que la alarma deje de pitar por ellos.
 * Solo el sonido — el banner y el latido de la tarjeta siguen igual, porque lo
 * que ella acusó fue haberlo VISTO, no haberlo resuelto. Ver la cabecera de
 * `lib/orders/attention.ts`.
 *
 * SOBREVIVE A RECARGAR LA PÁGINA, y esto no es una comodidad: el panel se
 * recarga solo con un despliegue o con un tirón de red, y sin persistencia cada
 * recarga le devolvía la tanda de bips entera de todo lo que ya había visto —
 * justo el castigo que hace que alguien apague las alertas.
 *
 * NO VIAJA ENTRE DISPOSITIVOS. Vive en `localStorage`, así que si alguien abre
 * el panel en otro teléfono, ahí no hay acuses y suena. Es lo correcto para el
 * piloto (una cajera, un dispositivo) y es una decisión reversible: compartirlo
 * pide una columna en `orders` y escribir desde el panel, que es bastante más
 * superficie para un caso que hoy no existe.
 *
 * LA CLAVE LLEVA EL ESTADO DENTRO (`attentionKey`), así que un pedido que
 * cambia de situación vuelve a sonar solo. Y las claves de pedidos que ya no
 * están en el tablero se tiran: sin eso, la lista crecería sin techo en un
 * dispositivo que no se cierra nunca.
 */
export function useAcknowledged(vms: readonly OrderVM[]): {
  acknowledged: ReadonlySet<string>
  acknowledge: (o: Pick<OrderVM, 'rowId' | 'status'>) => void
} {
  const [keys, setKeys] = useState<string[]>(() => {
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

  const acknowledge = useCallback((o: Pick<OrderVM, 'rowId' | 'status'>) => {
    const key = attentionKey(o)
    setKeys((prev) => (prev.includes(key) ? prev : [...prev, key].slice(-MAX_ACUSES)))
  }, [])

  // Poda: fuera lo que ya no está en el tablero. Se compara contra las claves
  // vivas y no contra los `rowId`, para que el pedido que cambió de estado
  // pierda su acuse viejo en cuanto deja de existir esa situación. La regla de
  // cuándo NO se puede podar vive en `pruneAcks`.
  //
  // Corre cada segundo, porque `vms` se recalcula con el tick de los relojes.
  // Por eso devuelve el mismo array cuando no hay nada que tirar: así React
  // aborta la actualización y esto no repinta el tablero entero cada segundo.
  const vivas = useMemo(() => new Set(vms.map(attentionKey)), [vms])
  useEffect(() => {
    setKeys((prev) => {
      const podadas = pruneAcks(prev, vivas)
      return podadas.length === prev.length ? prev : podadas
    })
  }, [vivas])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
    } catch {
      // Modo incógnito o cuota llena: el acuse deja de sobrevivir a la recarga,
      // que es peor UX pero no rompe nada.
    }
  }, [keys])

  const acknowledged = useMemo(() => new Set(keys), [keys])
  return { acknowledged, acknowledge }
}
