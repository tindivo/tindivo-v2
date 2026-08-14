'use client'

import { EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { useCashSettlements } from '../hooks/use-cash-settlements'
import { CashSummary } from './cash-summary'
import { DriverCard } from './driver-card'
import { HistorialNoches } from './historial-noches'

/**
 * El efectivo de la noche, organizado por MOTORIZADO.
 *
 * Antes eran cinco secciones apiladas por estado del sistema —«Pendiente del
 * motorizado», «Por confirmar ahora», «En disputa», «Historial»— y la cajera
 * tenía que cruzar nombres entre ellas para reconstruir a quién tenía delante.
 * Ahora cada persona es una tarjeta y sus tres estados van dentro, en orden de
 * urgencia. Solo el historial queda fuera: ya no es de nadie que esté ahí.
 */
export function EfectivoList() {
  const { drivers, historial, loading, error, reload } = useCashSettlements()

  if (loading) return <SkeletonList count={3} />

  const porConfirmar = drivers.flatMap((d) => d.porConfirmar)
  const enCamino = drivers.flatMap((d) => d.porEntregar)
  const enDisputa = drivers.reduce((s, d) => s + d.enDisputa.length, 0)
  const recibidoHoy = drivers.reduce((s, d) => s + d.confirmadoHoy.total, 0)
  const arrastre = drivers.reduce((s, d) => s + d.arrastre, 0)
  const conAlgo = drivers.filter(
    (d) => d.porConfirmar.length + d.enDisputa.length + d.porEntregar.length > 0,
  )

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>
      )}

      <CashSummary
        porConfirmar={porConfirmar.reduce((s, l) => s + l.cashOwed, 0)}
        porConfirmarCount={porConfirmar.length}
        enCamino={enCamino.reduce((s, l) => s + l.cashOwed, 0)}
        enCaminoCount={enCamino.length}
        recibidoHoy={recibidoHoy}
        enDisputa={enDisputa}
      />

      {/* Una sola llamada a la acción, y solo cuando la hay. El banner viejo
          avisaba de «N cierres pendientes» encima de una lista que ya los
          mostraba; este añade lo que la lista NO puede decir de un vistazo: que
          parte de ese dinero lleva más de una noche esperando. */}
      {porConfirmar.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-warning-soft p-3 text-sm text-amber-900">
          <Icon name="payments" size={18} filled className="mt-px shrink-0" />
          <div>
            <strong className="font-semibold">
              Cuenta {soles(porConfirmar.reduce((s, l) => s + l.cashOwed, 0))} antes de confirmar.
            </strong>{' '}
            No se confirman solas.
            {arrastre > 0 && (
              <>
                {' '}
                <span className="font-semibold">
                  {soles(arrastre)} vienen de noches anteriores.
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {conAlgo.length === 0 ? (
        <EmptyState
          icon="payments"
          heading="Sin efectivo pendiente"
          description="Aparecerá aquí, cliente por cliente, en cuanto un motorizado cobre en efectivo."
        />
      ) : (
        // Dos columnas SOLO con dos o más motorizados. El piloto tiene uno, y
        // una rejilla de dos columnas dejaba media pantalla en blanco al lado de
        // la única tarjeta — se lee como si algo no hubiera cargado.
        <div
          className={
            conAlgo.length > 1
              ? 'flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start'
              : 'flex flex-col gap-3 lg:max-w-2xl'
          }
        >
          {conAlgo.map((d) => (
            <DriverCard key={d.driverId} driver={d} onDone={reload} />
          ))}
        </div>
      )}

      <HistorialNoches noches={historial} />
    </>
  )
}
