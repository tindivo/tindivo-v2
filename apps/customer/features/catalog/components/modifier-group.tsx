'use client'

import { Icon } from '@/components/ui'
import { soles } from '@/features/catalog/lib/format'
import type { ModGroupData, ModOption } from '@/features/catalog/types'

interface ModifierGroupProps {
  group: ModGroupData
  selected: string | string[]
  missing?: boolean
  onToggle: (g: ModGroupData, opt: ModOption) => void
}

export function ModifierGroup({ group, selected, missing, onToggle }: ModifierGroupProps) {
  const isSingle = group.selection_type === 'single'
  const count = isSingle ? (selected ? 1 : 0) : (selected as string[]).length

  return (
    <div
      className={`mt-3.5 rounded-[18px] bg-white p-4 ${
        missing ? 'border border-brand' : 'border border-black/5'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="t-display text-[17px]">{group.name}</div>
        {group.is_required ? (
          <span
            className={`rounded-md px-2 py-1 font-bold text-[10px] uppercase ${
              count > 0 ? 'bg-success/12 text-success' : 'bg-brand/10 text-brand'
            }`}
          >
            {count > 0 ? 'Listo' : 'Obligatorio'}
          </span>
        ) : !isSingle ? (
          <span className="text-[12px] text-black/50">
            {count}/{group.max_selections ?? '∞'}
          </span>
        ) : null}
      </div>
      <div className="mb-3 text-[12px] text-black/50">
        {isSingle ? 'Elige una opción' : `Hasta ${group.max_selections ?? '∞'}`}
      </div>
      <div className="flex flex-col gap-1.5">
        {group.options.map((opt) => {
          const sel = isSingle ? selected === opt.id : (selected as string[]).includes(opt.id)
          const disabled =
            !isSingle &&
            !sel &&
            group.max_selections != null &&
            (selected as string[]).length >= group.max_selections
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(group, opt)}
              disabled={disabled}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-3 text-left disabled:opacity-40 ${
                sel ? 'bg-brand/[0.06]' : 'bg-transparent'
              }`}
            >
              <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center border-2 ${
                  isSingle ? 'rounded-full' : 'rounded-[7px]'
                } ${sel ? 'border-brand' : 'border-black/25'} ${!isSingle && sel ? 'bg-brand text-white' : 'bg-transparent'}`}
              >
                {isSingle
                  ? sel && <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                  : sel && <Icon name="check" size={20} />}
              </span>
              <span className="flex-1">
                <span className="block font-medium text-[15px]">{opt.name}</span>
                {opt.description && (
                  <span className="block text-[12px] text-black/55">{opt.description}</span>
                )}
              </span>
              <span
                className={`font-medium text-[14px] ${
                  Number(opt.additional_price) > 0 ? 'text-ink' : 'text-black/45'
                }`}
              >
                {Number(opt.additional_price) > 0
                  ? `+${soles(Number(opt.additional_price))}`
                  : 'Incluido'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
