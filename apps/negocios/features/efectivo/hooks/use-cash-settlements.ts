'use client'

import { canalUnico } from '@tindivo/supabase'
import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** Fecha de Lima de hoy, en `YYYY-MM-DD`, para comparar con `settlement_date`. */
const fechaLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })
export const hoyLima = () => fechaLima.format(new Date())

/** En qué punto del camino está el efectivo de un pedido. */
export type CashLineState = 'pending' | 'delivering' | 'disputed' | 'confirmed'

/** Un cliente en la pantalla de la cajera. La unidad de todo desde 0157. */
export interface CashLine {
  orderId: string
  shortId: string
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  /** Sencillo que la caja adelantó. Vuelve aunque el cliente pagara por Yape. */
  advance: number
  state: CashLineState
  /** Null mientras el motorizado no lo haya entregado. */
  settlementId: string | null
  /** Fecha (Lima) del dinero. Marca el arrastre de noches anteriores. */
  settlementDate: string | null
  /** Solo en disputa: lo que la cajera dijo haber contado. */
  reportedAmount: number | null
}

/**
 * Un motorizado, con todo su efectivo junto.
 *
 * ESTA ES LA DECISIÓN DE LA PANTALLA. Antes había una sección "Pendiente del
 * motorizado" arriba y otra "Por confirmar" abajo, y para saber si Ernesto le
 * debía algo la cajera tenía que mirar en dos sitios y cruzar el nombre a ojo.
 * Ella no piensa en estados del sistema: piensa en la persona que tiene delante.
 */
export interface DriverCash {
  driverId: string
  name: string
  phone: string | null
  /** Ya te lo entregó. Cuenta y confirma. ES LO ACCIONABLE. */
  porConfirmar: CashLine[]
  /** El local reportó diferencia. Tindivo lo revisa. */
  enDisputa: CashLine[]
  /** Todavía lo lleva encima él. Informativo: no hay nada que hacer. */
  porEntregar: CashLine[]
  /** Cerrado esta noche. El recibo, no una tarea. */
  confirmadoHoy: { count: number; total: number }
  /** Dinero por confirmar de una fecha anterior a hoy. */
  arrastre: number
  /** Para ordenar: primero quien exige acción. */
  totalPorConfirmar: number
}

/** Una noche ya cerrada con un motorizado. El historial va así, no pedido a
 *  pedido: con una liquidación por cliente, una tarjeta por fila sería un
 *  scroll infinito en una semana. */
export interface NocheCerrada {
  key: string
  driverName: string
  fecha: string
  total: number
  count: number
  lines: CashLine[]
}

interface SettlementRow {
  id: string
  settlement_date: string
  delivered_at_ts: string | null
  delivered_amount: number | null
  reported_amount: number | null
  status: string
  driver_id: string | null
  drivers: { full_name: string | null; phone: string | null } | null
}

interface OrderRow {
  id: string
  short_id: string
  customer_name: string | null
  delivered_at: string | null
  cash_owed_at_delivery: number | null
  change_advanced: number | null
  cash_settlement_id: string | null
  driver_id: string | null
  drivers: { full_name: string | null; phone: string | null } | null
}

const ABIERTOS = ['pending_confirmation', 'disputed'] as const
const CERRADOS = ['confirmed', 'resolved', 'auto_assumed_confirmed'] as const

const recienteAntes = (a: CashLine, b: CashLine) =>
  (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')

function toLine(
  o: OrderRow,
  state: CashLineState,
  settlementId: string | null,
  settlementDate: string | null,
  reportedAmount: number | null,
): CashLine {
  return {
    orderId: o.id,
    shortId: o.short_id,
    customerName: o.customer_name,
    deliveredAt: o.delivered_at,
    cashOwed: Number(o.cash_owed_at_delivery ?? 0),
    advance: Number(o.change_advanced ?? 0),
    state,
    settlementId,
    settlementDate,
    reportedAmount,
  }
}

export function useCashSettlements() {
  const [drivers, setDrivers] = useState<DriverCash[]>([])
  const [historial, setHistorial] = useState<NocheCerrada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const supabase = getSupabaseBrowser()
    const hoy = hoyLima()

    try {
      // ── 1. Lo ABIERTO: sin límite y sin filtro de fecha ──────────────────
      //
      // NO SE PAGINA A PROPÓSITO. Antes esto venía de un `.limit(50)` sobre
      // TODAS las liquidaciones ordenadas por fecha, mezclando lo abierto con el
      // historial. Con una liquidación por pedido, 50 filas son unas cinco
      // noches: un pendiente de la semana pasada se caía de la ventana y
      // desaparecía de la pantalla sin que nadie lo hubiera confirmado. Lo
      // abierto es finito y pequeño por definición — si crece, es justamente la
      // señal que la cajera necesita ver.
      const { data: abiertosRaw, error: e1 } = await supabase
        .from('cash_settlements')
        .select(
          'id,settlement_date,delivered_at_ts,delivered_amount,reported_amount,status,driver_id,drivers(full_name,phone)',
        )
        .in('status', ABIERTOS)
      if (e1) throw new Error(e1.message)

      // ── 2. El historial, paginado ────────────────────────────────────────
      const { data: cerradosRaw } = await supabase
        .from('cash_settlements')
        .select(
          'id,settlement_date,delivered_at_ts,delivered_amount,reported_amount,status,driver_id,drivers(full_name,phone)',
        )
        .in('status', CERRADOS)
        .order('settlement_date', { ascending: false })
        .limit(80)

      const abiertos = (abiertosRaw ?? []) as unknown as SettlementRow[]
      const cerrados = (cerradosRaw ?? []) as unknown as SettlementRow[]
      const settlements = new Map<string, SettlementRow>()
      for (const s of [...abiertos, ...cerrados]) settlements.set(s.id, s)

      // ── 3. Los pedidos de esas liquidaciones ─────────────────────────────
      const ids = [...settlements.keys()]
      let enlazados: OrderRow[] = []
      if (ids.length > 0) {
        const { data } = await supabase
          .from('orders')
          .select(
            'id,short_id,customer_name,delivered_at,cash_owed_at_delivery,change_advanced,cash_settlement_id,driver_id,drivers(full_name,phone)',
          )
          .in('cash_settlement_id', ids)
        enlazados = (data ?? []) as unknown as OrderRow[]
      }

      // ── 4. Lo que el motorizado todavía lleva encima ──────────────────────
      //
      // LEE `cash_owed_at_delivery`, NO DEDUCE DEL MÉTODO. Filtrar `paid_cash` y
      // sumar `order_amount + delivery_fee` era una cuarta copia de la regla del
      // corte de caja, y hacía que la cajera viera un número y el motorizado
      // otro para el mismo dinero: un cobro mixto no salía aquí aunque él
      // llevara su parte, y desde 0146 el sencillo adelantado tampoco.
      //
      // `> 0` en vez de un filtro por método: lo que define si entra al corte es
      // llevar efectivo, no cómo se llame el cobro.
      const { data: sinRendirRaw } = await supabase
        .from('orders')
        .select(
          'id,short_id,customer_name,delivered_at,cash_owed_at_delivery,change_advanced,cash_settlement_id,driver_id,drivers(full_name,phone)',
        )
        .eq('status', 'delivered')
        .gt('cash_owed_at_delivery', 0)
        .is('cash_settlement_id', null)
        .not('driver_id', 'is', null)
      const sinRendir = (sinRendirRaw ?? []) as unknown as OrderRow[]

      // ── 5. Se arma por motorizado ────────────────────────────────────────
      const porMoto = new Map<string, DriverCash>()
      const moto = (id: string, o: { full_name: string | null; phone: string | null } | null) => {
        const d = porMoto.get(id) ?? {
          driverId: id,
          name: o?.full_name ?? 'Motorizado',
          phone: o?.phone ?? null,
          porConfirmar: [],
          enDisputa: [],
          porEntregar: [],
          confirmadoHoy: { count: 0, total: 0 },
          arrastre: 0,
          totalPorConfirmar: 0,
        }
        // El nombre puede venir de cualquiera de las tres consultas; gana el
        // primero que no sea el genérico.
        if (d.name === 'Motorizado' && o?.full_name) d.name = o.full_name
        if (!d.phone && o?.phone) d.phone = o.phone
        porMoto.set(id, d)
        return d
      }

      for (const o of sinRendir) {
        if (!o.driver_id) continue
        moto(o.driver_id, o.drivers).porEntregar.push(toLine(o, 'pending', null, null, null))
      }

      const nochesCerradas = new Map<string, NocheCerrada>()

      for (const o of enlazados) {
        const s = o.cash_settlement_id ? settlements.get(o.cash_settlement_id) : undefined
        if (!s?.driver_id) continue

        if (s.status === 'pending_confirmation') {
          const d = moto(s.driver_id, s.drivers ?? o.drivers)
          const line = toLine(o, 'delivering', s.id, s.settlement_date, null)
          d.porConfirmar.push(line)
          d.totalPorConfirmar += line.cashOwed
          if (s.settlement_date < hoy) d.arrastre += line.cashOwed
        } else if (s.status === 'disputed') {
          const d = moto(s.driver_id, s.drivers ?? o.drivers)
          d.enDisputa.push(toLine(o, 'disputed', s.id, s.settlement_date, s.reported_amount))
        } else if (s.settlement_date === hoy) {
          // Cerrado esta noche: se queda en la tarjeta del motorizado, colapsado.
          const d = moto(s.driver_id, s.drivers ?? o.drivers)
          d.confirmadoHoy.count += 1
          d.confirmadoHoy.total += Number(o.cash_owed_at_delivery ?? 0)
        } else {
          // Noches anteriores: al historial, agrupado por (motorizado, noche).
          const key = `${s.driver_id}|${s.settlement_date}`
          const n = nochesCerradas.get(key) ?? {
            key,
            driverName: s.drivers?.full_name ?? o.drivers?.full_name ?? 'Motorizado',
            fecha: s.settlement_date,
            total: 0,
            count: 0,
            lines: [],
          }
          const line = toLine(o, 'confirmed', s.id, s.settlement_date, null)
          n.total += line.cashOwed
          n.count += 1
          n.lines.push(line)
          nochesCerradas.set(key, n)
        }
      }

      for (const d of porMoto.values()) {
        d.porConfirmar.sort(recienteAntes)
        d.enDisputa.sort(recienteAntes)
        d.porEntregar.sort(recienteAntes)
      }
      for (const n of nochesCerradas.values()) n.lines.sort(recienteAntes)

      // Primero quien exige acción; entre ellos, el que trae más dinero.
      setDrivers(
        [...porMoto.values()].sort(
          (a, b) =>
            b.porConfirmar.length - a.porConfirmar.length ||
            b.totalPorConfirmar - a.totalPorConfirmar,
        ),
      )
      setHistorial([...nochesCerradas.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Nombre único POR SUSCRIPCIÓN. Con `'biz-cash'` fijo, un remontaje dentro
    // de la ventana asíncrona de `removeChannel` recibía el canal anterior
    // todavía conectado y el `.on()` lanzaba «cannot add postgres_changes
    // callbacks ... after subscribe()». Ver `canalUnico` en `@tindivo/supabase`.
    const channel = getSupabaseBrowser()
      .channel(canalUnico('biz-cash'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
        load(),
      )
      // También sobre `orders`: "Todavía lo tiene él" se calcula ahí, así que
      // tiene que refrescar cuando un pedido se entrega o se enlaza a un ciclo.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    return () => {
      getSupabaseBrowser().removeChannel(channel)
    }
  }, [load])

  return { drivers, historial, loading, error, reload: load }
}
