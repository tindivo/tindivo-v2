import { Button, EmptyState } from '@tindivo/ui'
import Link from 'next/link'
import { SupportLink } from '@/components/support-link'
import { cancelledCopy } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface CancelledViewProps {
  data: Tracking
}

export function CancelledView({ data }: CancelledViewProps) {
  const c = cancelledCopy(data.cancelReason, {
    paymentIntent: data.paymentIntent,
    proofUrl: data.proofUrl,
  })
  // `schedule` se reserva para los vencimientos por tiempo. Todo lo demás —
  // cancelación de una de las partes, comprobante rechazado, no-show — es un
  // desenlace, no una espera agotada.
  const isMutual =
    data.cancelReason === 'customer_cancelled' ||
    data.cancelReason === 'business_cancelled' ||
    data.cancelReason === 'no_show' ||
    data.cancelReason === 'proof_rejected_final'

  return (
    <main className="mx-auto flex min-h-dvh max-w-[768px] flex-col bg-surface px-6">
      <div className="flex flex-1 flex-col items-center justify-center pt-10 text-center">
        <EmptyState
          icon={isMutual ? 'error' : 'schedule'}
          heading={c.title}
          description={c.body}
          action={
            <Link href="/" className="w-full max-w-xs">
              <Button className="w-full">Volver al menú</Button>
            </Link>
          }
        />
      </div>
      <div className="pb-5 pt-5">
        <div className="flex justify-center">
          <SupportLink orderShortId={data.shortId} />
        </div>
      </div>
    </main>
  )
}
