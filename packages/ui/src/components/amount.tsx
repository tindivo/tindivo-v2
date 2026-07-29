import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

export interface AmountProps extends HTMLAttributes<HTMLSpanElement> {
  amount: number | null | undefined
  currency?: string
  ref?: Ref<HTMLSpanElement>
}

export function Amount({
  className,
  amount,
  currency = 'S/',
  ref,
  ...props
}: AmountProps) {
  const value = amount == null || Number.isNaN(amount) ? null : Number(amount).toFixed(2)
  return (
    <span
      ref={ref}
      className={cn('font-mono tabular-nums', className)}
      {...props}
    >
      {value == null ? '—' : `${currency} ${value}`}
    </span>
  )
}
