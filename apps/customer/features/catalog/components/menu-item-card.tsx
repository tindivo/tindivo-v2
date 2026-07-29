'use client'

import { Icon, ProductImage } from '@/components/ui'
import { soles } from '@/features/catalog/lib/format'
import type { MenuItem } from '@/features/catalog/types'

interface MenuItemCardProps {
  item: MenuItem
  disabled?: boolean
  onClick: (item: MenuItem) => void
}

export function MenuItemCard({ item, disabled, onClick }: MenuItemCardProps) {
  const groups = item.modifier_groups ?? []
  const hasOptions = groups.some((g) => g.options.length > 0)
  const hasPaidOptions = groups.some((g) => g.options.some((o) => Number(o.additional_price) > 0))

  return (
    <button
      type="button"
      disabled={disabled || !item.is_available}
      onClick={() => onClick(item)}
      className="flex items-stretch gap-3.5 rounded-[20px] border border-border bg-white p-3 text-left disabled:opacity-50"
    >
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {(item.is_compact || item.badges?.[0]) && (
            <span className="mb-1.5 flex flex-wrap gap-1.5">
              {item.is_compact && (
                <span className="inline-block rounded-md bg-brand/8 px-2 py-[3px] font-bold text-[10px] uppercase tracking-[0.08em] text-brand">
                  ★ Destacado
                </span>
              )}
              {item.badges?.[0] && (
                <span className="inline-block rounded-md bg-brand/8 px-2 py-[3px] font-bold text-[10px] uppercase tracking-[0.08em] text-brand">
                  {item.badges[0]}
                </span>
              )}
            </span>
          )}
          <div className="t-display mb-1 text-[16px]">{item.name}</div>
          {item.description && (
            <div className="line-clamp-2 text-[12px] leading-[1.4] text-black/55">
              {item.description}
            </div>
          )}
        </div>
        <div className="mt-2 font-semibold text-[15px] tabular-nums">
          {hasPaidOptions ? `Desde ${soles(item.base_price)}` : soles(item.base_price)}
          {hasOptions && (
            <span className="ml-1.5 font-normal text-[11px] text-black/50">· Personalizable</span>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        <ProductImage label={item.name} hue={item.image_hue ?? 14} size={92} src={item.image_url} />
        <span className="absolute -right-1.5 -bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow-[0_4px_12px_-2px_rgba(249,115,22,0.55)]">
          <Icon name="add" size={20} />
        </span>
      </div>
    </button>
  )
}
