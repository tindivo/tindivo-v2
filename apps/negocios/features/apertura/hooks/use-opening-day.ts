'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type DayStatus = 'open' | 'closed'

interface OpeningDay {
  /** null = todavía no se sabe (cargando) o el negocio no ha declarado nada. */
  status: DayStatus | null
  loading: boolean
  saving: boolean
  error: string | null
  /** Jornada operativa vigente (no siempre la fecha de hoy: ver 0154). */
  serviceDate: string | null
  declare: (status: DayStatus, note?: string) => Promise<boolean>
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
  const [serviceDate, setServiceDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bizId) return
    let cancelled = false
    const supabase = getSupabaseBrowser()

    async function load() {
      const { data: today, error: dateErr } = await supabase.rpc('current_service_date')
      if (cancelled) return
      if (dateErr || !today) {
        setError('No pudimos consultar la fecha de servicio.')
        setLoading(false)
        return
      }
      setServiceDate(today)

      const { data } = await supabase
        .from('business_service_days')
        .select('status')
        .eq('business_id', bizId)
        .eq('service_date', today)
        .maybeSingle()

      if (cancelled) return
      setStatus((data?.status as DayStatus | undefined) ?? null)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [bizId])

  const declare = useCallback(
    async (next: DayStatus, note?: string): Promise<boolean> => {
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
          note: note ?? null,
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

  return { status, loading, saving, error, serviceDate, declare }
}
