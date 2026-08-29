'use client'

import { Button, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { useCashSettlements } from '../hooks/use-cash-settlements'
import { CashSummary } from './cash-summary'
import { DriverCard } from './driver-card'

/**
 * El efectivo de la noche, organizado por MOTORIZADO.
 *
 * Cada persona es una tarjeta y sus tres estados van dentro, en orden de
 * urgencia. Las noches cerradas anteriores se consultan bajo demanda
 * a través del botón de historial.
 */
export function EfectivoList({ onOpenHistorial }: { onOpenHistorial?: () => void }) {
  const { drivers, loading, error, reload } = useCashSettlements()

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

      {onOpenHistorial && (
        <div className="mt-8 flex justify-center border-t border-ink/[0.06] pt-6">
          <Button variant="outline" onClick={onOpenHistorial} className="gap-2">
            <Icon name="history" size={18} />
            Ver noches cerradas
          </Button>
        </div>
      )}
    </>
  )
}
