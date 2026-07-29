import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
}

export function Skeleton({ className, ref, ...props }: SkeletonProps) {
  return (
    <div
      ref={ref}
      className={cn('animate-pulse rounded-xl bg-surface-low', className)}
      {...props}
    />
  )
}
