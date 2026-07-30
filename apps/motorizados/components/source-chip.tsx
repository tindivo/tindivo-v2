/** Badge Manual/Online del pedido (origen del pedido). */
import { Badge } from '@tindivo/ui'

export function SourceChip({ source }: { source: string }) {
  const online = source === 'customer_pwa'
  return (
    <Badge variant={online ? 'brand' : 'info'} size="sm">
      {online ? 'Online' : 'Manual'}
    </Badge>
  )
}
