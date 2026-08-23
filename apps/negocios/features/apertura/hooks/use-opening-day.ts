'use client'

import { getOpenStatus, type ScheduleDayRow } from '@tindivo/contracts'
import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type DayStatus = 'open' | 'closed'

/** Fallback si `app_settings.max_change` no llega. Mismo valor que la 0143. */
const DEFAULT_MAX_CHANGE = 50

interface OpeningDay {
  /** null = el negocio todavía no ha declarado nada para esta jornada. */
  status: DayStatus | null
  /**
   * Vuelto máximo que el negocio puede dar esta jornada. `null` = no lo declaró
   * y manda el global de `app_settings.max_change`, que es lo que trae
   * `defaultChange` para poder mostrarlo como valor de partida.
   *
   * Cero es una declaración válida —"hoy solo pago exacto"— y no es lo mismo
   * que null, así que en ningún sitio se comprueba con un `if (changeAvailable)`.
   */
  changeAvailable: number | null
  /** `app_settings.max_change`: lo que rige mientras no se declare nada. */
  defaultChange: number
  /**
   * Si el horario semanal dice que a esta hora debería estar atendiendo. Es lo
   * que decide si tiene sentido preguntar: a las diez de la mañana el negocio
   * está cambiando precios, no abriendo.
   */
  withinSchedule: boolean
  loading: boolean
  saving: boolean
  error: string | null
  declare: (status: DayStatus) => Promise<boolean>
  /** `null` borra la declaración y devuelve la noche al global. */
  setChange: (amount: number | null) => Promise<boolean>
}

/**
 * Declaración de apertura de la jornada.
 *
 * La fecha la decide la base con `current_service_date()` y no el navegador:
 * el celular de la cajera puede tener la hora corrida, y a las 00:10 eso
 * significaría abrir una jornada nueva en plena faena.
 */
export function useOpeningDay(): OpeningDay {
  const { bizId } = useDashboard()
  const [status, setStatus] = useState<DayStatus | null>(null)
  const [changeAvailable, setChangeAvailable] = useState<number | null>(null)
  const [defaultChange, setDefaultChange] = useState(DEFAULT_MAX_CHANGE)
  const [serviceDate, setServiceDate] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ScheduleDayRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bizId) return
    let cancelled = false
    const supabase = getSupabaseBrowser()

    async function load() {
      const [{ data: today, error: dateErr }, { data: days }, { data: setting }] =
        await Promise.all([
          supabase.rpc('current_service_date'),
          supabase
            .from('business_schedule')
            .select('day_of_week,is_open,shift1_start,shift1_end,shift2_start,shift2_end')
            .eq('business_id', bizId as string),
          supabase.from('app_settings').select('value').eq('key', 'max_change').maybeSingle(),
        ])
      if (cancelled) return
      if (dateErr || !today) {
        setError('No pudimos consultar la fecha de servicio.')
        setLoading(false)
        return
      }
      setServiceDate(today)
      setSchedule((days ?? []) as ScheduleDayRow[])

      const rawDefault = setting?.value
      const parsedDefault =
        typeof rawDefault === 'number'
          ? rawDefault
          : typeof rawDefault === 'string'
            ? Number(rawDefault)
            : Number.NaN
      if (Number.isFinite(parsedDefault)) setDefaultChange(parsedDefault)

      const { data } = await supabase
        .from('business_service_days')
        .select('status, change_available')
        .eq('business_id', bizId as string)
        .eq('service_date', today)
        .maybeSingle()

      if (cancelled) return
      setStatus((data?.status as DayStatus | undefined) ?? null)
      setChangeAvailable(data?.change_available ?? null)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [bizId])

  const declare = useCallback(
    async (next: DayStatus): Promise<boolean> => {
      if (!bizId || !serviceDate) return false
      setSaving(true)
      setError(null)
      const supabase = getSupabaseBrowser()
      const { data: auth } = await supabase.auth.getUser()

      const { error: upErr } = await supabase.from('business_service_days').upsert(
        {
          business_id: bizId,
          service_date: serviceDate,
          status: next,
          confirmed_at: new Date().toISOString(),
          confirmed_by: auth.user?.id ?? null,
        },
        { onConflict: 'business_id,service_date' },
      )

      if (upErr) {
        setError(upErr.message)
        setSaving(false)
        return false
      }
      setStatus(next)
      setSaving(false)
      return true
    },
    [bizId, serviceDate],
  )

  /**
   * Declara el vuelto de la jornada. Es un UPDATE y no un upsert a propósito:
   * la fila la crea `declare()` al abrir, y sin fila no hay nada que ajustar
   * —un negocio que todavía no dijo si atiende no tiene noche que configurar—.
   */
  const setChange = useCallback(
    async (amount: number | null): Promise<boolean> => {
      if (!bizId || !serviceDate) return false
      setSaving(true)
      setError(null)

      const { error: upErr } = await getSupabaseBrowser()
        .from('business_service_days')
        .update({ change_available: amount })
        .eq('business_id', bizId)
        .eq('service_date', serviceDate)

      if (upErr) {
        setError(upErr.message)
        setSaving(false)
        return false
      }
      setChangeAvailable(amount)
      setSaving(false)
      return true
    },
    [bizId, serviceDate],
  )

  // Se pregunta por la declaración solo dentro del horario del negocio. Un
  // local sin horario configurado no tiene hora de apertura que esperar, así
  // que ahí siempre aplica.
  const withinSchedule =
    schedule === null ? false : getOpenStatus(schedule, new Date()).kind !== 'closed'

  return {
    status,
    changeAvailable,
    defaultChange,
    withinSchedule,
    loading,
    saving,
    error,
    declare,
    setChange,
  }
}
