'use client'

import { getOpenStatus } from '@tindivo/contracts'
import { Icon } from '@/components/ui'
import type { BusinessDetail } from '@/features/catalog/types'

interface ClosedBannerProps {
  schedule: BusinessDetail['schedule']
  now: Date
}

export function ClosedBanner({ schedule, now }: ClosedBannerProps) {
  const status = getOpenStatus(schedule, now)
  const message =
    status.kind === 'closed' && status.opensToday && status.opensAt
      ? `Abre hoy a las ${status.opensAt}.`
      : 'Revisa el horario de atención.'

  return (
    <div className="px-4 pt-3">
      <div className="t-warning-banner flex items-start gap-2.5 rounded-[16px] px-4 py-3 text-[13px]">
        <span className="mt-0.5 shrink-0">
          <Icon.Clock />
        </span>
        <span>
          <span className="font-semibold">Sin atención ahora.</span> {message}
        </span>
      </div>
    </div>
  )
}
