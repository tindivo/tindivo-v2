'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type PolledQueryResult<T> = {
  data: T | undefined
  error: Error | null
  isLoading: boolean
  refetch: (options?: { force?: boolean }) => Promise<void>
}

export interface UsePolledQueryOptions<T> {
  queryKey: string
  queryFn: () => Promise<T>
  refetchInterval: number // ms; puede cambiar dinámicamente entre renders
  enabled?: boolean
  dedupeIntervalMs?: number // Cooldown para evitar peticiones idénticas seguidas (default 1000ms)
}

/**
 * Hook de datos con polling adaptativo.
 * Reemplazo liviano y determinista para TanStack Query.
 *
 * Características:
 * 1. setInterval con refetchInterval actual (re-creado si cambia refetchInterval).
 * 2. Cancelación al desmontar (flag mountedRef) para descartar respuestas en vuelo.
 * 3. Evita peticiones solapadas (inFlightRef) y deduplica llamadas cercanas en time (dedupeIntervalMs).
 * 4. Refetch inmediato en visibilitychange cuando la pestaña vuelve a ser visible (deduplicado con Realtime).
 * 5. Pausa el polling cuando document.hidden === true.
 *
 * LOS REFETCH SOLAPADOS SE APLAZAN, NO SE DESCARTAN — y esa es la diferencia
 * entre "llega tarde" y "no llega".
 *
 * Los dos guardas de arriba (solapamiento y cooldown) hacían `return` a secas, y
 * quien llamaba no se enteraba: no hay valor de retorno que distinga "ya está
 * refrescado" de "tu petición se tiró a la basura". Para el `setInterval` da
 * igual, porque vuelve a intentarlo solo. Para el REALTIME no: ese evento ocurre
 * UNA vez. Descartarlo significa que el cambio no se ve hasta el siguiente tick
 * del poll, y el tablero de la cajera se queda enseñando un pedido que ya no
 * existe —o escondiendo uno que sí— durante todo ese intervalo.
 *
 * Ahora la petición que no puede correr ahora queda ANOTADA y se salda sola: al
 * terminar el fetch en vuelo, o al expirar el cooldown. Se conserva el
 * espaciado que los guardas venían a dar; lo único que se pierde es el
 * silencio.
 */
export function usePolledQuery<T>({
  queryKey,
  queryFn,
  refetchInterval,
  enabled = true,
  dedupeIntervalMs = 1000,
}: UsePolledQueryOptions<T>): PolledQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(enabled)

  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const lastFetchTimeRef = useRef<number>(0)
  /** Alguien pidió refrescar mientras había un fetch en vuelo. Deuda a saldar. */
  const pendingRef = useRef(false)
  /** Timer del cooldown. `null` = no hay ninguna petición aplazada esperando. */
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // `executeFetch` tiene que poder re-invocarse a sí mismo para saldar la deuda,
  // y un `useCallback` no puede nombrarse dentro de su propio cuerpo. El ref se
  // asigna en cada render, justo debajo de la definición.
  const executeFetchRef = useRef<(opts?: { force?: boolean }) => Promise<void>>(async () => {})

  const executeFetch = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!mountedRef.current) return

      // Hay un fetch en vuelo. No se encola una petición paralela —el guarda
      // original sigue vigente— pero SÍ se anota que hay que volver a pedir en
      // cuanto termine: la respuesta que está viajando salió antes del cambio
      // que motivó esta llamada, así que no lo trae.
      if (inFlightRef.current) {
        pendingRef.current = true
        return
      }

      const now = Date.now()
      const sinceLast = now - lastFetchTimeRef.current
      // Cooldown de deduplicación (evita doble fetch al volver de segundo plano
      // si Realtime y visibilitychange coinciden). Se APLAZA al final de la
      // ventana en vez de descartarse; si ya hay una aplazada, esa sirve.
      if (!opts?.force && sinceLast < dedupeIntervalMs) {
        if (cooldownTimerRef.current === null) {
          cooldownTimerRef.current = setTimeout(() => {
            cooldownTimerRef.current = null
            if (mountedRef.current) void executeFetchRef.current()
          }, dedupeIntervalMs - sinceLast)
        }
        return
      }

      inFlightRef.current = true
      lastFetchTimeRef.current = now
      // Esta petición ya cubre cualquier deuda anterior: sale AHORA, después de
      // todo lo que la provocó.
      pendingRef.current = false

      try {
        const result = await queryFnRef.current()
        if (mountedRef.current) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false)
        }
        inFlightRef.current = false
        // Deuda pendiente: llegó al menos un evento mientras esto viajaba. La
        // re-entrada cae en el cooldown de arriba, así que sale ~1s después en
        // vez de encadenar peticiones a pelo.
        if (pendingRef.current && mountedRef.current) {
          pendingRef.current = false
          void executeFetchRef.current()
        }
      }
    },
    [dedupeIntervalMs],
  )
  executeFetchRef.current = executeFetch

  // Refetch manual exportado
  const refetch = useCallback(
    async (options?: { force?: boolean }) => {
      await executeFetch(options)
    },
    [executeFetch],
  )

  // Manejo de montaje / desmontaje
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // La petición aplazada muere con el componente: sin esto, el timer
      // sobrevive al desmontaje y dispara un fetch que nadie va a leer.
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
      pendingRef.current = false
    }
  }, [])

  // Carga inicial y refetch por visibilidad
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    void executeFetch()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && mountedRef.current) {
        void executeFetch()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, executeFetch, queryKey])

  // Timer de polling (setInterval) adaptativo
  useEffect(() => {
    if (!enabled || refetchInterval <= 0) return

    const intervalId = setInterval(() => {
      if (document.hidden) return // Pausar si la pestaña está oculta
      if (inFlightRef.current) return // Evitar peticiones solapadas
      void executeFetch()
    }, refetchInterval)

    return () => {
      clearInterval(intervalId)
    }
  }, [enabled, refetchInterval, executeFetch])

  return {
    data,
    error,
    isLoading,
    refetch,
  }
}
