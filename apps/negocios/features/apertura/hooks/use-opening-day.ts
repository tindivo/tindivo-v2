'use client'

import {
  currentShift,
  declarationIsStale,
  getOpenStatus,
  hasLaterShiftToday,
  type ScheduleDayRow,
  type ShiftView,
} from '@tindivo/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type DayStatus = 'open' | 'closed'

/** Fallback si `app_settings.max_change` no llega. Mismo valor que la 0143. */
const DEFAULT_MAX_CHANGE = 50

/**
 * CADA CUÁNTO MIRA EL RELOJ, Y POR QUÉ NECESITA MIRARLO.
 *
 * Este hook decidía «¿estamos en horario?» en el render, con un `new Date()`
 * suelto. Eso solo se recalcula cuando algo lo hace repintar, y el panel puede
 * pasarse horas quieto: sin pedidos activos, `chrome.tsx` ni siquiera corre su
 * tick de un segundo. O sea que un panel abierto desde el turno de mediodía NO
 * SE ENTERABA de que daban las 18:00, y la pregunta de apertura del segundo
 * turno no llegaba a plantearse aunque el resto del código quisiera.
 *
 * Veinte segundos sobran: la frontera de un turno es de minuto entero.
 */
const TICK_MS = 20_000

/** Clave estable del turno, para detectar que cambió sin comparar objetos. */
const shiftKey = (sh: ShiftView | null): string => (sh ? `${sh.startLabel}-${sh.endLabel}` : '')

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
  /** Jornada de servicio en curso (`current_service_date`), en `YYYY-MM-DD`. */
  serviceDate: string | null
  /**
   * El turno que corre ahora mismo, para poder nombrarlo. `null` fuera de
   * horario o sin horario configurado.
   */
  shift: ShiftView | null
  /** Hay otro turno más tarde HOY: lo que se cierre ahora no cierra el día. */
  moreShiftsToday: boolean
  /**
   * HAY QUE VOLVER A PREGUNTAR. Es `true` cuando no hay declaración de esta
   * jornada o cuando la que hay se hizo en OTRO turno. Ver `declarationIsStale`
   * en `@tindivo/contracts`: el sábado a las 18:00, lo que se dijo a las 11:00
   * ya no responde por la noche.
   */
  mustAsk: boolean
  /**
   * La pregunta viene de un turno nuevo y no de una jornada en blanco. Cambia
   * el texto: no es lo mismo «¿abren hoy?» que «empieza tu turno de la noche».
   */
  askingForNewShift: boolean
  /**
   * ¿Ese instante pasó en un turno ANTERIOR al de ahora?
   *
   * Lo usan dos cosas que caducan igual: la declaración de apertura y la prueba
   * de sonido. Las dos describen «lo que se sabía en un turno», y las dos dejan
   * de valer en el siguiente por la misma razón — entre uno y otro el local se
   * cierra, cambia la persona del mostrador y la tablet se queda sola.
   */
  madeInPreviousShift: (at: Date) => boolean
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
  /** Cuándo se hizo la declaración vigente. De aquí sale si habla de este turno. */
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Reloj propio: ver `TICK_MS`. */
  const [now, setNow] = useState(() => new Date())
  /** Sube al empezar un turno nuevo y obliga a releer la base. */
  const [recargas, setRecargas] = useState(0)
  /** Turno con el que se leyó la base la última vez, para recargar al cambiar. */
  const cargadoParaTurno = useRef<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(t)
  }, [])

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
      const horario = (days ?? []) as ScheduleDayRow[]
      setSchedule(horario)
      // Se anota CON QUÉ TURNO se leyó, para que el efecto de más abajo sepa
      // que estos datos ya son los de ahora y no dispare otra lectura.
      cargadoParaTurno.current = shiftKey(currentShift(horario, new Date()))

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
        .select('status, change_available, confirmed_at')
        .eq('business_id', bizId as string)
        .eq('service_date', today)
        .maybeSingle()

      if (cancelled) return
      setStatus((data?.status as DayStatus | undefined) ?? null)
      setChangeAvailable(data?.change_available ?? null)
      setConfirmedAt(data?.confirmed_at ? new Date(data.confirmed_at as string) : null)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
    // `recargas` fuerza una lectura nueva al cambiar de turno: ver el efecto de
    // abajo. Sin eso, un panel abierto desde el mediodía entra en el turno de la
    // noche con los datos de la mañana y sin saber si alguien ya lo abrió desde
    // otro dispositivo.
  }, [bizId, recargas])

  /**
   * AL EMPEZAR UN TURNO NUEVO, SE VUELVE A LEER LA BASE.
   *
   * No es una optimización ni un refresco de cortesía. A las 18:00 hay que
   * decidir si se planta la pregunta, y esa decisión no se puede tomar con los
   * datos de las 11:00: entre medias han podido abrir desde el celular del
   * dueño, o cambiar el horario, o —lo más probable— haber cruzado el corte de
   * las 05:00 y estar mirando la jornada de ayer. Se relee entero, `service_date`
   * incluida, que es justo lo que `load()` ya sabe hacer.
   */
  const shift = schedule === null ? null : currentShift(schedule, now)
  const turnoAhora = shiftKey(shift)
  useEffect(() => {
    if (!bizId || cargadoParaTurno.current === null) return
    if (cargadoParaTurno.current === turnoAhora) return
    cargadoParaTurno.current = turnoAhora
    setRecargas((n) => n + 1)
  }, [bizId, turnoAhora])

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
      // La declaración pasa a ser de ESTE instante, y con eso deja de ser de
      // otro turno: es lo que hace desaparecer la pregunta al contestarla.
      setConfirmedAt(new Date())
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
  const withinSchedule = schedule === null ? false : getOpenStatus(schedule, now).kind !== 'closed'

  const moreShiftsToday = schedule === null ? false : hasLaterShiftToday(schedule, now)

  /**
   * LA PREGUNTA QUE FALTABA. Ver `declarationIsStale` en `@tindivo/contracts`.
   *
   * Con `confirmed_at` a null —solo pasa en datos sembrados— no se vuelve a
   * preguntar: no hay instante contra el que medir, y una pregunta de más en
   * mitad del turno cuesta más que la que se ahorra.
   */
  const madeInPreviousShift = (at: Date): boolean =>
    schedule !== null && declarationIsStale(schedule, now, at)
  const declaracionDeOtroTurno = confirmedAt !== null && madeInPreviousShift(confirmedAt)
  const askingForNewShift = status !== null && declaracionDeOtroTurno
  const mustAsk = withinSchedule && (status === null || declaracionDeOtroTurno)

  return {
    status,
    changeAvailable,
    defaultChange,
    withinSchedule,
    serviceDate,
    shift,
    moreShiftsToday,
    mustAsk,
    askingForNewShift,
    madeInPreviousShift,
    loading,
    saving,
    error,
    declare,
    setChange,
  }
}
