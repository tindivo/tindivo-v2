'use client'

import type { TrackingStep } from '@tindivo/contracts'
import type { CSSProperties } from 'react'
import { etaLabel, getStepSub } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface TrackingHeroProps {
  data: Tracking
  step: { key: TrackingStep; label: string; sub: string }
  currentIdx: number
  progress: number
}

export function TrackingHero({ data, step, currentIdx, progress }: TrackingHeroProps) {
  const isDelivered = step.key === 'delivered'

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-ink px-5 py-[22px] text-white">
      <div
        className="absolute top-0 right-0 h-[140px] w-[140px] translate-x-10 -translate-y-10 rounded-full bg-brand/40 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative z-[1]">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/20 px-2.5 py-[5px] font-mono text-[10px] uppercase tracking-[0.2em] text-brand-light">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-light" />
          Pedido #{data.shortId}
        </div>
        <div className="t-display mt-3 text-[30px] leading-tight">{step.label}</div>
        <div className="mt-1 text-[14px] text-white/70">{getStepSub(step, data)}</div>
        <div className="mt-[18px] h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full w-[var(--progress)] rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-500"
            style={{ '--progress': `${progress}%` } as CSSProperties}
          />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-white/60">
          <span>Paso {currentIdx + 1} de 4</span>
          {!isDelivered && (
            <span className="tabular-nums">ETA {etaLabel(data.estimatedReadyAt)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
