'use client'

import type { ReactNode } from 'react'
import { Icon } from './icon'

/** Header con back circular + título display. */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-border border-b bg-surface px-4 pt-3.5 pb-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink"
          aria-label="Volver"
        >
          <Icon.Back />
        </button>
      )}
      <div className="t-display flex-1 text-[22px]">{title}</div>
      {right}
    </div>
  )
}
