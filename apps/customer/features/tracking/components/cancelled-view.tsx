import { Button, EmptyState } from '@tindivo/ui'
import Link from 'next/link'
import { SupportLink } from '@/components/ui'
import { cancelledCopy } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface CancelledViewProps {
  data: Tracking
}

export function CancelledView({ data }: CancelledViewProps) {
  const c = cancelledCopy(data.cancelReason)
  const isMutual =
    data.cancelReason === 'customer_cancelled' || data.cancelReason === 'business_cancelled'

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
