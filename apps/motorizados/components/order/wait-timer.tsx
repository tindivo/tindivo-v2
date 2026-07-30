'use client'

import { Card } from '@tindivo/ui'
import { mmss } from '@/lib/format'

/** Semáforo de espera en el local: gris (0-5) / ámbar (5-10) / rojo (10+). */
export function WaitTimer({ since, now }: { since: string; now: number }) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000))
  const minutes = seconds / 60
  const tone =
    minutes >= 10
      ? { card: 'bg-danger-soft border-danger/15 text-danger', text: 'text-danger' }
      : minutes >= 5
        ? { card: 'bg-warning-soft border-warning/20 text-warning', text: 'text-warning' }
        : { card: 'bg-ink/[0.04] border-transparent text-ink-muted', text: 'text-ink-muted' }

  return (
    <div>
      <Card
        className={`mt-3.5 flex items-center justify-between border-none px-4 py-3.5 shadow-none ${tone.card}`}
      >
        <span className="text-[14px]">Esperando en el local</span>
        <span className={`font-mono text-[22px] font-bold tabular-nums ${tone.text}`}>
          {mmss(seconds)}
        </span>
      </Card>
      {minutes >= 10 && (
        <p className="mt-2 px-1 text-[12px] text-danger">
          Demora inusual. Llama al local o reporta un problema.
        </p>
      )}
    </div>
  )
}
