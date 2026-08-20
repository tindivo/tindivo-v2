'use client'

import { type OrderStatus, toTrackingStep } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { CancelledView } from '@/features/tracking/components/cancelled-view'
import { TrackingActions } from '@/features/tracking/components/tracking-actions'
import { TrackingAlertToast } from '@/features/tracking/components/tracking-alert-toast'
import { TrackingAppealView } from '@/features/tracking/components/tracking-appeal-view'
import { TrackingCancelRow } from '@/features/tracking/components/tracking-cancel-row'
import { TrackingDriver } from '@/features/tracking/components/tracking-driver'
import { TrackingHero } from '@/features/tracking/components/tracking-hero'
import { TrackingItems } from '@/features/tracking/components/tracking-items'
import { TrackingPrepay } from '@/features/tracking/components/tracking-prepay'
import { TrackingShell } from '@/features/tracking/components/tracking-shell'
import { TrackingSoundToggle } from '@/features/tracking/components/tracking-sound-toggle'
import { TrackingSteps } from '@/features/tracking/components/tracking-steps'
import { useCountdown } from '@/features/tracking/hooks/use-countdown'
import { useStatusAlerts } from '@/features/tracking/hooks/use-status-alerts'
import { useTracking } from '@/features/tracking/hooks/use-tracking'
import { isCancellable, STEPS } from '@/features/tracking/lib/format'

/**
 * El seguimiento del pedido, en tres zonas y en este orden:
 *
 *   1. ESTADO — el hero: en qué punto está y cuándo llega.
 *   2. AHORA MISMO — una sola cosa, la que el cliente puede hacer en este
 *      instante: cancelar mientras se pueda, pagar, o escribir al motorizado que
 *      está en su puerta. Va inmediatamente debajo del hero.
 *   3. REFERENCIA — el camino completo, quién trae el pedido y el detalle. Se
 *      consulta, no se vigila, así que va después y en tono tranquilo.
 *
 * El orden anterior tenía la acción al final: cancelar estaba tras el detalle
 * del pedido, es decir, fuera de pantalla justo durante los cinco minutos en que
 * sirve para algo.
 */
export default function TrackingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const router = useRouter()
  const { data, error, ownedId, load, cancel } = useTracking(shortId)
  const countdown = useCountdown(data)
  const { alerta, descartar, sonidoActivo, alternarSonido } = useStatusAlerts(data)

  const current = data ? toTrackingStep(data.status as OrderStatus) : null
  const foundIdx = current ? STEPS.findIndex((s) => s.key === current) : -1
  const currentIdx = foundIdx < 0 ? 0 : foundIdx
  const step =
    STEPS[currentIdx] ??
    ({
      key: 'received' as const,
      label: 'Pedido recibido',
      sub: 'Estamos confirmándolo con el restaurante',
    } as {
      key: 'received'
      label: string
      sub: string
    })
  const progress = ((currentIdx + 1) / STEPS.length) * 100
  const cancellable = data ? isCancellable(data, ownedId) : false
  const enRuta = current === 'ontheway' || current === 'delivered'

  if (data?.status === 'cancelled' && data.cancelReason !== 'proof_rejected_final') {
    return <CancelledView data={data} />
  }

  return (
    <TrackingShell
      title="Tu pedido"
      onBack={() => router.back()}
      error={error}
      data={data}
      right={<TrackingSoundToggle activo={sonidoActivo} onToggle={alternarSonido} />}
    >
      <TrackingAlertToast alerta={alerta} onClose={descartar} />
      {data && (
        <div className="px-4 pt-1.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <div className="lg:min-w-0">
            {data.status === 'cancelled' && data.cancelReason === 'proof_rejected_final' ? (
              <TrackingAppealView data={data} ownedId={ownedId} onAppealCreated={load} />
            ) : (
              <>
                {/* 1 · Estado */}
                <TrackingHero data={data} step={step} currentIdx={currentIdx} progress={progress} />

                {/* 2 · Ahora mismo */}
                {cancellable && (
                  <TrackingCancelRow data={data} countdown={countdown} cancel={cancel} />
                )}
                <TrackingPrepay
                  data={data}
                  ownedId={ownedId}
                  countdown={countdown}
                  onProofUploaded={load}
                />

                {/* 3 · Referencia */}
                <TrackingSteps currentIdx={currentIdx} />
              </>
            )}
          </div>

          <div className="lg:min-w-0">
            <TrackingDriver data={data} enRuta={enRuta} />
            <TrackingItems data={data} />
            <TrackingActions data={data} current={current} cancellable={cancellable} />
          </div>
        </div>
      )}
    </TrackingShell>
  )
}
