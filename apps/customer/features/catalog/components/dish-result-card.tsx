'use client'

import Link from 'next/link'
import { ProductImage } from '@/components/ui'
import { soles } from '@/features/catalog/lib/format'
import type { SearchItem } from '@/lib/use-search'

interface DishResultCardProps {
  item: SearchItem
}

export function DishResultCard({ item }: DishResultCardProps) {
  return (
    <Link
      href={`/negocio/${item.business_id}`}
      className="flex items-center gap-3.5 rounded-[20px] border border-border bg-white p-3"
    >
      <ProductImage label={item.name} hue={item.image_hue ?? 14} size={64} src={item.image_url} />
      <div className="min-w-0 flex-1">
        <div className="t-display text-[16px] leading-tight">{item.name}</div>
        {item.description && (
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-black/55">
            {item.description}
          </div>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-semibold text-[14px] tabular-nums">
            {soles(Number(item.base_price))}
          </span>
          <span className="truncate text-[11px] text-black/50">{item.business_name}</span>
        </div>
      </div>
    </Link>
  )
}
