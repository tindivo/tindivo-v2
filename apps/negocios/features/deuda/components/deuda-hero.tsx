'use client'

import { soles } from '@/components/dashboard/primitives'
import { BLOCK_THRESHOLD } from '../lib/constants'

export function DeudaHero({ balance, isBlocked }: { balance: number; isBlocked: boolean }) {
  const pct = Math.min(balance / BLOCK_THRESHOLD, 1) * 100

  return (
    <div
      className="rounded-2xl p-5 text-white"
      style={{ background: 'linear-gradient(135deg, #1A1614 0%, #2A2422 100%)' }}
    >
      {isBlocked && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-danger/20 px-3 py-1 text-xs font-semibold text-danger-light">
          Cuenta suspendida
        </div>
      )}

      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-white/60">
        Debes ahora
      </div>
      <div className="font-mono mt-1 text-[44px] font-bold leading-none">{soles(balance)}</div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[11px] text-white/70">
          <span>0</span>
          <span>Suspensión a {soles(BLOCK_THRESHOLD)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background: pct >= 80 ? '#dc2626' : '#f97316',
            }}
          />
        </div>
      </div>
    </div>
  )
}
