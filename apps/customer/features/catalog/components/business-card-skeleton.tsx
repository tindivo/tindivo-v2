import { Card, Skeleton } from '@tindivo/ui'

/**
 * El hueco de una `BusinessCard`, con su forma y sus 96 px exactos.
 *
 * Vive en su propio fichero porque antes había DOS esqueletos para la misma
 * card: la portada pintaba un bloque `surface-low` de 112 px y el buscador uno
 * blanco de 112 px, con separaciones distintas. La card mide 96, así que las
 * tres saltaban 16 px al terminar de cargar, y cada lista saltaba a su manera.
 *
 * Si la card cambia de alto, este fichero cambia con ella.
 */
export function BusinessCardSkeleton() {
  return (
    <Card className="flex items-center gap-3 p-3">
      <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-2xl" />
      <div className="flex h-[72px] min-w-0 flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-[14px] w-3/5 rounded-md" />
        <Skeleton className="h-[11px] w-4/5 rounded-md" />
        <Skeleton className="h-[11px] w-1/3 rounded-md" />
      </div>
    </Card>
  )
}
