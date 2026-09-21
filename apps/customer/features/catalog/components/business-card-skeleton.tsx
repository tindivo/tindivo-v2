import { Card, Skeleton } from '@tindivo/ui'

/**
 * El hueco de una `BusinessCard`, con su forma exacta: portada `aspect-[3/2]`
 * arriba y el logo montado sobre la costura con `-mt-6`, igual que la card real.
 *
 * Vive en su propio fichero porque antes había DOS esqueletos para la misma
 * card, con separaciones distintas, y saltaban de forma diferente al terminar
 * de cargar. Si la card cambia de forma, este fichero cambia con ella.
 */
export function BusinessCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[3/2] w-full rounded-none" />
      <div className="flex items-end gap-3 px-3 pb-3">
        <Skeleton className="-mt-6 h-12 w-12 shrink-0 rounded-2xl ring-4 ring-card" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pb-0.5">
          <Skeleton className="h-[14px] w-3/5 rounded-md" />
          <Skeleton className="h-[11px] w-4/5 rounded-md" />
        </div>
      </div>
    </Card>
  )
}
