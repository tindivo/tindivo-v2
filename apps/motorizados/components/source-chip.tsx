/** Badge Manual/Online del pedido (origen del pedido). */
import { Icon } from '@tindivo/ui'

export function SourceChip({ source }: { source: string }) {
  const online = source === 'customer_pwa'
  if (online) {
    return (
      <span className="inline-flex items-center gap-[3px] rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
        <Icon name="language" size={10} weight={500} />
        Online
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-[3px] rounded-full border border-amber-300/60 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
      <Icon name="call" size={10} weight={500} />
      Manual
    </span>
  )
}
