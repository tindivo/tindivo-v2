'use client'

import type { REALTIME_LISTEN_TYPES, RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type ChannelHealthStatus = 'healthy' | 'degraded' | 'disconnected'

export interface ChannelHealthConfig {
  healthyIntervalMs?: number // default 30000 (30s)
  degradedIntervalMs?: number // default 20000 (20s)
}

export interface UseChannelHealthResult {
  healthStatus: ChannelHealthStatus
  refetchIntervalMs: number
  channelStatus: string
  setChannelState: (status: string) => void
}

/**
 * Hook para monitorear la salud de un canal de Realtime y derivar
 * el intervalo de polling adaptativo (30s sano / 20s degradado).
 *
 * POR QUÉ 30s Y NO 90s. El intervalo "sano" no es el ritmo al que se refresca el
 * tablero —eso lo hace Realtime, en menos de un segundo— sino EL TIEMPO QUE LA
 * CAJERA SE QUEDA CIEGA CUANDO REALTIME FALLA. Y falla: correlacionando en los
 * logs de producción la hora de cada pedido manual con el siguiente refresco del
 * tablero, del mismo negocio y en la misma sesión, unos cuantos se refrescaron
 * en ~1s y otros tuvieron que esperar al poll (97s, 393s). El canal no está
 * muerto —por eso `healthStatus` lo ve sano y no degrada a 20s—, se le escapan
 * eventos sueltos.
 *
 * 90 segundos era una eternidad para lo que hay al otro lado: un pedido web
 * entra en `pending_acceptance` y SE AUTOCANCELA A LOS 5 MINUTOS. Perderse un
 * evento gastaba casi un tercio de ese plazo antes de que la cajera pudiera
 * siquiera enterarse.
 *
 * El costo es despreciable en el piloto: 4 negocios, ~10 pedidos/noche, una
 * consulta que ya está acotada a 100 filas. Si algún día pesa, lo que hay que
 * arreglar es por qué se pierden los eventos, no volver a subir este número.
 */
export function useChannelHealth(
  initialStatus: string = 'CLOSED',
  config: ChannelHealthConfig = {},
): UseChannelHealthResult {
  const healthyIntervalMs = config.healthyIntervalMs ?? 30000
  const degradedIntervalMs = config.degradedIntervalMs ?? 20000

  const [channelStatus, setChannelStatus] = useState<string>(initialStatus)

  const setChannelState = useCallback((status: string) => {
    setChannelStatus(status)
  }, [])

  const healthStatus: ChannelHealthStatus =
    channelStatus === 'SUBSCRIBED'
      ? 'healthy'
      : channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT'
        ? 'degraded'
        : 'disconnected'

  const refetchIntervalMs = healthStatus === 'healthy' ? healthyIntervalMs : degradedIntervalMs

  return {
    healthStatus,
    refetchIntervalMs,
    channelStatus,
    setChannelState,
  }
}

/**
 * Helper para calcular el retardo de reconexión con backoff exponencial.
 * 1s -> 2s -> 4s -> 8s -> 16s -> 30s (máximo)
 */
export function getBackoffDelayMs(attempt: number, maxDelayMs: number = 30000): number {
  const delay = 1000 * 2 ** attempt
  return Math.min(maxDelayMs, delay)
}

/**
 * Helper hook para crear y suscribir a un canal de Supabase Realtime con
 * auto-reconstrucción de canal quemado ante errores o cierres y backoff exponencial.
 */
export function useManagedRealtimeChannel(opts: {
  topic: string
  enabled?: boolean
  onPostgresChanges?: (payload: unknown) => void
  onHealthChange?: (status: ChannelHealthStatus, refetchIntervalMs: number) => void
}) {
  const { topic, enabled = true, onPostgresChanges, onHealthChange } = opts
  const { healthStatus, refetchIntervalMs, channelStatus, setChannelState } = useChannelHealth()

  const onPostgresChangesRef = useRef(onPostgresChanges)
  onPostgresChangesRef.current = onPostgresChanges

  const onHealthChangeRef = useRef(onHealthChange)
  onHealthChangeRef.current = onHealthChange

  const retryAttemptRef = useRef<number>(0)

  useEffect(() => {
    onHealthChangeRef.current?.(healthStatus, refetchIntervalMs)
  }, [healthStatus, refetchIntervalMs])

  useEffect(() => {
    if (!enabled || !topic) return

    let activeChannel: RealtimeChannel | null = null
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    function createAndSubscribeChannel() {
      if (destroyed) return
      const supabase = getSupabaseBrowser()

      // Destruir canal previo si existe antes de crear uno nuevo (evita fugas y canales quemados)
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
        activeChannel = null
      }

      const channel = supabase.channel(topic)

      if (onPostgresChangesRef.current) {
        channel.on(
          'postgres_changes' as REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
          { event: '*', schema: 'public' },
          (payload) => {
            if (!destroyed) {
              onPostgresChangesRef.current?.(payload)
            }
          },
        )
      }

      channel.subscribe((status, err) => {
        if (destroyed) return
        setChannelState(status)

        if (status === 'SUBSCRIBED') {
          // Reset del contador de intentos al reconectar exitosamente
          retryAttemptRef.current = 0
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          const delayMs = getBackoffDelayMs(retryAttemptRef.current)
          retryAttemptRef.current += 1

          console.warn(
            `[realtime] Canal ${topic} en estado ${status} (intento ${retryAttemptRef.current}). Re-creando en ${delayMs / 1000}s...`,
            err,
          )

          // Re-creación con backoff exponencial
          if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId)
          reconnectTimeoutId = setTimeout(() => {
            if (!destroyed) {
              createAndSubscribeChannel()
            }
          }, delayMs)
        }
      })

      activeChannel = channel
    }

    createAndSubscribeChannel()

    return () => {
      destroyed = true
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId)
      if (activeChannel) {
        getSupabaseBrowser().removeChannel(activeChannel)
        activeChannel = null
      }
      setChannelState('CLOSED')
    }
  }, [enabled, topic, setChannelState])

  return {
    healthStatus,
    refetchIntervalMs,
    channelStatus,
  }
}
