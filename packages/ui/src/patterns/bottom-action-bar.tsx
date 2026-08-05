import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface BottomActionBarProps {
  children: ReactNode
  className?: string
}

export function BottomActionBar({ children, className }: BottomActionBarProps) {
  return (
    <div
      className={cn(
        'fixed right-0 bottom-0 left-0 z-50 border-t border-[rgba(26,22,20,0.06)] bg-white/95 px-4 pt-3 pb-safe backdrop-blur-md',
        className,
      )}
      style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-[480px] flex-col gap-2">{children}</div>
    </div>
  )
}
