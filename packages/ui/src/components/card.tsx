import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
}

export function Card({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn('rounded-2xl border border-border bg-card shadow-elev-1', className)}
      {...props}
    />
  )
}

export function CardBody({ className, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn('p-4', className)} {...props} />
}
