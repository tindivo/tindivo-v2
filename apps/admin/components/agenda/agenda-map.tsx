'use client'

import dynamic from 'next/dynamic'
import type { LatLng } from './agenda-map-inner'

export type { LatLng }

const Inner = dynamic(() => import('./agenda-map-inner'), {
  ssr: false,
  loading: () => <div className="h-60 w-full animate-pulse rounded-xl bg-ink/[0.06]" />,
})

export function AgendaMap({
  value,
  onChange,
  heightPx = 240,
}: {
  value: LatLng | null
  onChange: (coords: LatLng) => void
  heightPx?: number
}) {
  return <Inner value={value} onChange={onChange} heightPx={heightPx} />
}
