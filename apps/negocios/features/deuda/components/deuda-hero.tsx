'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import { BLOCK_THRESHOLD } from '../lib/constants'

export function DeudaHero({ balance, isBlocked }: { balance: number; isBlocked: boolean }) {
  const pct = Math.min(Math.max(balance / BLOCK_THRESHOLD, 0), 1) * 100
  const isZero = balance <= 0

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1F1B18] via-[#2A2421] to-[#1A1614] p-4 sm:p-5 text-white shadow-elev-2">
      {/* Glow sutil de fondo */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl"
        style={{
          background: isBlocked
            ? 'rgba(220, 38, 38, 0.25)'
            : isZero
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(249, 115, 22, 0.2)',
        }}
      />

      <div className="relative z-1 flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/60">
          Saldo deudor actual
        </span>
        {isBlocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/20 px-2.5 py-0.5 text-xs font-semibold text-danger-light">
            <Icon name="block" size={13} filled />
            Cuenta suspendida
          </span>
        ) : isZero ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
            <Icon name="check_circle" size={14} filled />
            Al día
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-semibold text-brand-light">
            Por liquidar
          </span>
        )}
      </div>

      <div className="relative z-1 mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-xl sm:text-2xl font-bold text-white/70">S/</span>
        <span className="font-mono text-[38px] sm:text-[44px] font-extrabold tracking-tight leading-none text-white">
          {balance.toFixed(2)}
        </span>
      </div>

      <div className="relative z-1 mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-white/70">
          <span>Límite de crédito</span>
          <span className="font-mono">{soles(BLOCK_THRESHOLD)} máx.</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/12">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isBlocked || pct >= 80 ? 'bg-danger' : 'bg-brand'
            }`}
            style={{ width: `${Math.max(pct, isZero ? 0 : 3)}%` }}
          />
        </div>
        {!isBlocked && balance > 0 && (
          <p className="mt-1.5 text-right font-mono text-[10px] text-white/50">
            {pct.toFixed(0)}% del límite alcanzado
          </p>
        )}
      </div>
    </div>
  )
}
