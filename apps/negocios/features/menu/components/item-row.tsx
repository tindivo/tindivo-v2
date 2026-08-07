import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { countAgotadoOptions, formatItemPrice } from '../lib/utils'
import type { MenuItem } from '../types'

interface ItemRowProps {
  item: MenuItem
}

export function ItemRow({ item }: ItemRowProps) {
  const hasGroups = item.modifierGroups.length > 0
  const agotadoCount = countAgotadoOptions(item)

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-card p-3 transition-opacity ${
        item.is_available ? '' : 'opacity-65'
      }`}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-low">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-ink/40">
            {item.name.slice(0, 6).toUpperCase()}
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`text-[15px] font-bold ${
              item.is_available ? 'text-ink' : 'text-ink-subtle line-through'
            }`}
          >
            {item.name}
          </span>
          {!item.is_available && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
              Agotado
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-ink">{formatItemPrice(item)}</span>
          {hasGroups ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-bold text-info">
              <Icon name="tune" size={10} />
              {item.modifierGroups.length} grupo{item.modifierGroups.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
              <Icon name="shopping_cart" size={10} />
              Directo al carrito
            </span>
          )}
          {agotadoCount > 0 && (
            <span className="text-[10px] font-semibold text-warning">
              {agotadoCount} opción{agotadoCount > 1 ? 'es' : ''} agotada
              {agotadoCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <Link
        href={`/menu/item/${item.id}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1.5 text-[12px] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
      >
        <Icon name="edit" size={15} />
        Editar
      </Link>
    </div>
  )
}
