'use client'

import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { AppealSection } from '@/features/tracking/components/appeal-section'
import { soles } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface TrackingAppealViewProps {
  data: Tracking
  ownedId: string | null
  onAppealCreated: () => void
}

export function TrackingAppealView({ data, ownedId, onAppealCreated }: TrackingAppealViewProps) {
  return (
    <div className="flex-1 px-4 pt-4">
      <div className="rounded-[22px] border border-[rgba(26,22,20,0.05)] bg-white p-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-ink-subtle">#{data.shortId}</span>
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
            Pago no verificado
          </span>
        </div>
        <p className="mt-1.5 text-[14px] font-semibold text-ink">{data.businessName}</p>
        <p className="mt-0.5 text-[13px] text-ink-muted">Total: {soles(data.total)}</p>
      </div>

      <AppealSection
        orderId={ownedId}
        shortId={data.shortId}
        hasAppeal={data.hasAppeal ?? false}
        total={data.total}
        onAppealCreated={onAppealCreated}
      />

      <div className="px-4 pb-6 pt-4">
        <Link href="/" className="block w-full">
          <Button variant="ghost" className="w-full">
            ← Volver al inicio
          </Button>
        </Link>
      </div>
    </div>
  )
}
