'use client'

import { Icon } from '@tindivo/ui'

export function CartEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="text-ink/30">
        <Icon name="shopping_basket" size={20} />
      </span>
      <p className="t-display text-[15px]">Tu bolsa está vacía</p>
      <p className="text-[13px] text-ink/55">Agrega productos de un restaurante para empezar.</p>
    </div>
  )
}
