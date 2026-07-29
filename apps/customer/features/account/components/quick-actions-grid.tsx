import type { CustomerAppealListItemDto } from '@tindivo/contracts'
import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { AccountStats } from '@/features/account/hooks/use-account-page'

interface QuickActionsGridProps {
  stats: AccountStats
  appeals: CustomerAppealListItemDto[]
}

export function QuickActionsGrid({ stats, appeals }: QuickActionsGridProps) {
  const whatsappUrl = `https://wa.me/${TINDIVO_SUPPORT_WHATSAPP}?text=${encodeURIComponent('Hola Tindivo, necesito ayuda con mi cuenta. ')}`
  const firstPendingAppeal = appeals.find(
    (a) => a.appealStatus === 'pending' || a.appealStatus === 'in_review',
  )

  return (
    <div className="mt-5 grid grid-cols-3 gap-3">
      <ActionCard
        href="/pedidos"
        icon="receipt_long"
        label="Pedidos"
        badge={stats.activeOrdersCount > 0 ? String(stats.activeOrdersCount) : undefined}
        sub={stats.activeOrdersCount === 1 ? '1 en curso' : 'Ver todos'}
      />
      <ActionCard
        href={firstPendingAppeal ? `/pedido/${firstPendingAppeal.orderShortId}` : '/pedidos'}
        icon="gavel"
        label="Apelaciones"
        tone={stats.pendingAppealsCount > 0 ? 'danger' : 'default'}
        badge={stats.pendingAppealsCount > 0 ? String(stats.pendingAppealsCount) : undefined}
        sub={
          stats.pendingAppealsCount > 0
            ? `${stats.pendingAppealsCount} pendiente${stats.pendingAppealsCount === 1 ? '' : 's'}`
            : stats.appealsCount > 0
              ? 'Ver resumen'
              : 'Sin reclamos'
        }
      />
      <ActionCard href={whatsappUrl} external icon="chat" label="Soporte" sub="WhatsApp" />
    </div>
  )
}

interface ActionCardProps {
  href: string
  icon: string
  label: string
  sub: string
  badge?: string
  tone?: 'default' | 'danger'
  external?: boolean
}

function ActionCard({
  href,
  icon,
  label,
  sub,
  badge,
  tone = 'default',
  external,
}: ActionCardProps) {
  const content = (
    <div className="flex flex-col items-center gap-1.5 rounded-[18px] border border-border bg-card p-3 text-center transition-shadow hover:shadow-elev-1 active:scale-[0.98]">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon name={icon} size={22} />
        {badge && (
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${tone === 'danger' ? 'bg-danger' : 'bg-danger'}`}
          >
            {badge}
          </span>
        )}
      </span>
      <div>
        <div className="text-[13px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] text-ink-muted">{sub}</div>
      </div>
    </div>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {content}
      </a>
    )
  }
  return <Link href={href}>{content}</Link>
}
