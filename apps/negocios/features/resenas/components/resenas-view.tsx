'use client'

import { useMemo, useState } from 'react'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { type DatePreset, getPresetRange } from '@/lib/order-history/date-utils'
import { useReviews } from '../hooks/use-reviews'
import { useReviewsList } from '../hooks/use-reviews-list'
import { ReviewsList } from './reviews-list'
import { ReviewsSummaryCard } from './reviews-summary'

/**
 * El rango por defecto es 15 DÍAS, no los 7 de Rendimiento.
 *
 * Y es a propósito. Las reseñas llegan mucho más despacio que los pedidos: solo
 * las deja quien tiene cuenta en la app, y se le pregunta la siguiente vez que
 * pide, no al entregar. En una semana pueden ser dos, y con dos no hay nada que
 * leer.
 *
 * Rodante y no «este mes» porque «este mes» se vacía cada día 1: la cajera
 * abriría la pantalla el primero de septiembre y vería cero después de un
 * agosto entero de reseñas.
 */
const DEFAULT_PRESET = 'last_15_days' satisfies Exclude<DatePreset, 'custom'>

export function ResenasView() {
  const [activePreset, setActivePreset] = useState<DatePreset>(DEFAULT_PRESET)
  const [{ start, end }, setRange] = useState(() => getPresetRange(DEFAULT_PRESET))

  const resumen = useReviews(start, end)
  const lista = useReviewsList(start, end)

  // El nombre de cada etiqueta ya lo trae el resumen desde `app_settings`; la
  // lista lo reusa en vez de pedir el catálogo por segunda vez.
  const etiquetas = useMemo(
    () => new Map((resumen.data?.etiquetas ?? []).map((t) => [t.id, t.label])),
    [resumen.data],
  )

  return (
    <>
      <DateRangePicker
        startDate={start}
        endDate={end}
        onRangeChange={(s, e) => setRange({ start: s, end: e })}
        activePreset={activePreset}
        onPresetChange={setActivePreset}
      />

      <div className="flex flex-col gap-3.5 pb-6 lg:grid lg:grid-cols-2 lg:items-start">
        <ReviewsSummaryCard data={resumen.data} loading={resumen.loading} />
        <ReviewsList rows={lista.rows} loading={lista.loading} etiquetas={etiquetas} />
      </div>
    </>
  )
}
