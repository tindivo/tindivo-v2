import type { AnchorHTMLAttributes, HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type CardAs = 'div' | 'button' | 'a'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: CardAs
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  ref?: Ref<HTMLDivElement | HTMLButtonElement | HTMLAnchorElement>
}

export function Card({
  as = 'div',
  className,
  ref,
  ...props
}: CardProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const classes = cn(
    'rounded-[20px] border border-ink/[0.04] bg-card shadow-elev-1 transition-shadow duration-300 hover:shadow-elev-2',
    className,
  )
  if (as === 'button') {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        className={cn(classes, 'text-left')}
        {...(props as HTMLAttributes<HTMLButtonElement>)}
      />
    )
  }
  if (as === 'a') {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={cn(classes, 'block text-left no-underline')}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      />
    )
  }
  return <div ref={ref as Ref<HTMLDivElement>} className={classes} {...props} />
}

interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>
}

export function CardBody({ className, ref, ...props }: CardBodyProps) {
  return <div ref={ref} className={cn('p-4', className)} {...props} />
}
