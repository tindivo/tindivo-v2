'use client'

import type { ReactNode } from 'react'
import { Icon } from '../primitives/icon'

/** Header con back circular + título display. */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: ReactNode
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-ink/[0.04] bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink"
            aria-label="Volver"
          >
            <Icon name="arrow_back" size={22} />
          </button>
        )}
        <div className="flex-1 font-display text-base sm:text-lg font-bold tracking-tight">
          {title}
        </div>
        {right}
      </div>
    </div>
  )
}
