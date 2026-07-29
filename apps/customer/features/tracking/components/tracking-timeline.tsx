import { Icon } from '@tindivo/ui'
import { getStepSub, STEPS } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface TrackingTimelineProps {
  data: Tracking
  currentIdx: number
}

export function TrackingTimeline({ data, currentIdx }: TrackingTimelineProps) {
  return (
    <div className="mt-3.5 rounded-[22px] border border-ink/[0.04] bg-white px-[18px] py-5 shadow-elev-1">
      {STEPS.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const last = i === STEPS.length - 1

        return (
          <div key={s.key} className={`relative flex gap-3.5 ${last ? '' : 'pb-[18px]'}`}>
            {!last && (
              <div
                className={`absolute top-[26px] bottom-[-8px] left-[13px] w-0.5 ${
                  done ? 'bg-brand' : 'bg-ink/[0.08]'
                }`}
              />
            )}
            <div
              className={`z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
                done || active ? 'bg-brand' : 'bg-ink/[0.06]'
              } ${active ? 'shadow-[0_0_0_5px_rgba(242,98,65,0.18)]' : ''}`}
            >
              {done ? (
                <Icon name="check" size={16} filled />
              ) : (
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? 'animate-pulse bg-white' : 'bg-ink/[0.35]'
                  }`}
                />
              )}
            </div>
            <div className="flex-1 pt-0.5">
              <div
                className={`text-[15px] ${active ? 'font-semibold' : 'font-medium'} ${
                  done || active ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {s.label}
              </div>
              <div
                className={`mt-0.5 text-[12px] ${
                  active ? 'text-brand' : 'text-ink-subtle'
                }`}
              >
                {active
                  ? `${getStepSub(s, data)} · ahora`
                  : done
                    ? 'Completado'
                    : getStepSub(s, data)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
