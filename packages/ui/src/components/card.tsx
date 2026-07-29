import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
}

export function Card({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[20px] border border-ink/[0.04] bg-card shadow-elev-1 transition-shadow duration-300 hover:shadow-elev-2',
        className,
      )}
      {...props}
    />
  )
}

export function CardBody({ className, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn('p-4', className)} {...props} />
}
