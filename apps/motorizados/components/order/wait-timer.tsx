'use client'

import { mmss } from '@/lib/format'

/** Semáforo de espera en el local: gris (0-5) / ámbar (5-10) / rojo (10+). */
export function WaitTimer({ since, now }: { since: string; now: number }) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  const minutes = seconds / 60
  const tone =
    minutes >= 10
      ? { bg: 'rgba(220,38,38,0.08)', color: '#DC2626' }
      : minutes >= 5
        ? { bg: 'rgba(245,158,11,0.12)', color: '#92400E' }
        : { bg: 'rgba(26,22,20,0.05)', color: '#57534E' }

  return (
    <div>
      <div
        className="mt-3.5 flex items-center justify-between rounded-[18px] px-4 py-3.5"
        style={{ background: tone.bg }}
      >
        <span className="text-[14px]" style={{ color: tone.color }}>
          Esperando en el local
        </span>
        <span
          className="font-bold font-mono text-[22px] tabular-nums"
          style={{ color: tone.color }}
        >
          {mmss(seconds)}
        </span>
      </div>
      {minutes >= 10 && (
        <p className="mt-2 px-1 text-[12px] text-danger">
          Demora inusual. Llama al local o reporta un problema.
        </p>
      )}
    </div>
  )
}
