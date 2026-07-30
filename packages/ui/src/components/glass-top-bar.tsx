import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface GlassTopBarProps {
  title?: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
  className?: string
}

export function GlassTopBar({ title, subtitle, left, right, className }: GlassTopBarProps) {
  return (
    <header
      className={cn(
        'fixed top-0 right-0 left-0 z-40 border-b border-[rgba(26,22,20,0.06)] px-4 pt-safe',
        'bg-[rgba(255,255,255,0.82)] backdrop-blur-md',
        className,
      )}
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 12 }}
    >
      <div className="mx-auto flex max-w-[480px] items-center justify-between">
        <div className="flex items-center gap-2">
          {left}
          {(title || subtitle) && (
            <div>
              {title && (
                <h1 className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-ink-subtle">
                  {title}
                </h1>
              )}
              {subtitle && <p className="text-[13px] font-semibold text-ink">{subtitle}</p>}
            </div>
          )}
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </div>
    </header>
  )
}
