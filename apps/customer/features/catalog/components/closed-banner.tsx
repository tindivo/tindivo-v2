'use client'

import { getOpenStatus } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import type { BusinessDetail } from '@/features/catalog/types'

interface ClosedBannerProps {
  schedule: BusinessDetail['schedule']
  now: Date
  openingConfirmed?: boolean | null
}

export function ClosedBanner({ schedule, now, openingConfirmed }: ClosedBannerProps) {
  const status = getOpenStatus(schedule, now, openingConfirmed)
  // Está en su horario pero todavía no ha abierto: no sirve mandarle a mirar el
  // horario, porque el horario dice que debería estar atendiendo.
  const message =
    status.kind === 'closed' && status.reason === 'not_confirmed'
      ? 'Todavía no ha confirmado que atiende hoy.'
      : status.kind === 'closed' && status.opensToday && status.opensAt
        ? `Abre hoy a las ${status.opensAt}.`
        : 'Revisa el horario de atención.'

  return (
    <div className="px-4 pt-3">
      <div className="flex items-start gap-2.5 rounded-[16px] bg-warning-soft px-4 py-3 text-[13px] text-amber-900">
        <span className="mt-0.5 shrink-0">
          <Icon name="schedule" size={20} />
        </span>
        <span>
          <span className="font-semibold">Sin atención ahora.</span> {message}
        </span>
      </div>
    </div>
  )
}
