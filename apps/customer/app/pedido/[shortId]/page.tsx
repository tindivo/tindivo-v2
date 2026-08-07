'use client'

import { type OrderStatus, toTrackingStep } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { CancelledView } from '@/features/tracking/components/cancelled-view'
import { TrackingActions } from '@/features/tracking/components/tracking-actions'
import { TrackingAppealView } from '@/features/tracking/components/tracking-appeal-view'
import { TrackingHero } from '@/features/tracking/components/tracking-hero'
import { TrackingItems } from '@/features/tracking/components/tracking-items'
import { TrackingPrepay } from '@/features/tracking/components/tracking-prepay'
import { TrackingShell } from '@/features/tracking/components/tracking-shell'
import { TrackingTimeline } from '@/features/tracking/components/tracking-timeline'
import { useTracking } from '@/features/tracking/hooks/use-tracking'
import { isCancellable, STEPS } from '@/features/tracking/lib/format'

export default function TrackingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const router = useRouter()
  const { data, error, ownedId, load, cancel } = useTracking(shortId)

  const current = data ? toTrackingStep(data.status as OrderStatus) : null
  const foundIdx = current ? STEPS.findIndex((s) => s.key === current) : -1
  const currentIdx = foundIdx < 0 ? 0 : foundIdx
  const step =
    STEPS[currentIdx] ??
    ({
      key: 'received' as const,
      label: 'Pedido recibido',
      sub: 'El restaurante te llamará para confirmar',
    } as {
      key: 'received'
      label: string
      sub: string
    })
  const progress = ((currentIdx + 1) / STEPS.length) * 100
  const cancellable = data ? isCancellable(data, ownedId) : false

  if (data?.status === 'cancelled' && data.cancelReason !== 'proof_rejected_final') {
    return <CancelledView data={data} />
  }

  return (
    <TrackingShell title="Tu pedido" onBack={() => router.back()} error={error} data={data}>
      {data && (
        <div className="px-4 pt-1.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <div className="lg:min-w-0">
            {data.status === 'cancelled' && data.cancelReason === 'proof_rejected_final' ? (
              <TrackingAppealView data={data} ownedId={ownedId} onAppealCreated={load} />
            ) : (
              <>
                <TrackingHero data={data} step={step} currentIdx={currentIdx} progress={progress} />
                <TrackingPrepay data={data} ownedId={ownedId} onProofUploaded={load} />
                <TrackingTimeline data={data} currentIdx={currentIdx} />
              </>
            )}
          </div>

          <div className="lg:min-w-0">
            <TrackingItems data={data} />
            <TrackingActions
              data={data}
              current={current}
              cancellable={cancellable}
              cancel={cancel}
            />
          </div>
        </div>
      )}
    </TrackingShell>
  )
}
