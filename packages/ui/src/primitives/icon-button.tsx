import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'filled'
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  className,
  variant = 'ghost',
  size = 'md',
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        'disabled:pointer-events-none disabled:opacity-50',
        'active:scale-[0.97]',
        size === 'sm' ? 'h-9 w-9' : 'h-10 w-10',
        variant === 'filled'
          ? 'bg-ink/[0.06] text-ink hover:bg-ink/[0.1]'
          : 'bg-transparent text-ink hover:bg-ink/[0.05]',
        className,
      )}
      {...props}
    />
  )
}
