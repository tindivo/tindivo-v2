import { EmptyState } from '@tindivo/ui'

export function CartEmpty() {
  return (
    <EmptyState
      icon="shopping_basket"
      heading="Tu bolsa está vacía"
      description="Agrega productos de un restaurante para empezar."
    />
  )
}
