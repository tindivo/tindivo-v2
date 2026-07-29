'use client'

import { Icon } from '@tindivo/ui'
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
        <div className="mb-1 flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-danger bg-white text-danger">
          {isMutual ? <Icon name="error" size={44} /> : <Icon name="schedule" size={44} />}
        </div>
        <p className="mt-[18px] font-mono text-[10px] uppercase tracking-[0.2em] text-danger">
          {c.eyebrow}
        </p>
        <h1 className="t-display mt-1.5 text-[26px] leading-tight">{c.title}</h1>
        <p className="mt-3.5 max-w-[320px] text-[14px] leading-relaxed text-ink-muted">{c.body}</p>
      </div>
      <div className="pb-5 pt-5">
        <Link href="/" className="t-btn t-btn-primary t-btn-block">
          Volver al menú
        </Link>
        <div className="mt-2.5 flex justify-center">
          <SupportLink orderShortId={data.shortId} />
        </div>
      </div>
    </main>
  )
}
