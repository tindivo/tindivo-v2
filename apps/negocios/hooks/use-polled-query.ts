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

  const executeFetch = useCallback(
    async (opts?: { force?: boolean }) => {
      if (inFlightRef.current || !mountedRef.current) return

      const now = Date.now()
      // Cooldown de deduplicación (evita doble fetch al volver de segundo plano si Realtime y visibilitychange coinciden)
      if (!opts?.force && now - lastFetchTimeRef.current < dedupeIntervalMs) {
        return
      }

      inFlightRef.current = true
      lastFetchTimeRef.current = now

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
      }
    },
    [dedupeIntervalMs],
  )

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
