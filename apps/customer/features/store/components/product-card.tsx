import { formatStorePrice, primaryBadge, type StoreBadge } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { cardHref, toCore } from '../lib/present'
import type { StoreCard } from '../types'

export function BadgeView({ badge }: { badge: StoreBadge }) {
  switch (badge.kind) {
    case 'discount':
      return <span className="st-bg off">-{badge.percent}%</span>
    case 'clearance':
      return <span className="st-bg rem">Remate</span>
    case 'new':
      return <span className="st-bg new">Nuevo</span>
    case 'score':
      return <span className="st-bg score">Estado {badge.score}/10</span>
    case 'reserved':
      return (
        <span className="st-bg res">
          <Icon name="lock" size={14} />
          Reservado
        </span>
      )
    case 'sold':
      return <span className="st-bg sold">Vendido</span>
  }
}

/**
 * Tarjeta de la grilla. Foto 1:1 recortada hacia el punto central que eligió
 * Jesús, precio y texto FUERA de la foto, una sola insignia. `onOpen` marca que
 * el comprador viene del listado (el «volver» del detalle usa el historial).
 */
export function ProductCard({
  card,
  priority = false,
  variant = 'grid',
  onOpen,
}: {
  card: StoreCard
  priority?: boolean
  variant?: 'grid' | 'sold'
  onOpen?: () => void
}) {
  const core = toCore(card)
  const href = cardHref(card)
  if (!core || !href) return null

  const badge = primaryBadge(core)
  const hasPrev =
    core.originalPrice !== null &&
    core.originalPrice > core.price &&
    badge?.kind !== 'sold' &&
    variant !== 'sold'
  const cls = ['st-pc', card.status === 'reserved' ? 'res' : '', variant === 'sold' ? 'sold' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <Link href={href} className={cls} onClick={onOpen} prefetch={false}>
      <div className="st-ph">
        {card.thumbUrl && (
          // biome-ignore lint/performance/noImgElement: miniatura ya reducida a ~400 px por el admin
          <img
            src={card.thumbUrl}
            alt={core.title}
            width={400}
            height={400}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            style={{ objectPosition: `${card.coverFocusX * 100}% ${card.coverFocusY * 100}%` }}
          />
        )}
        {badge && <BadgeView badge={badge} />}
      </div>
      <div className="st-pc-body">
        <div className="st-pr">
          <b>{formatStorePrice(core.price)}</b>
          {hasPrev && core.originalPrice !== null && <s>{formatStorePrice(core.originalPrice)}</s>}
        </div>
        <h3>{core.title}</h3>
        {core.sizeLabel && variant !== 'sold' && <div className="st-sz">{core.sizeLabel}</div>}
      </div>
    </Link>
  )
}
