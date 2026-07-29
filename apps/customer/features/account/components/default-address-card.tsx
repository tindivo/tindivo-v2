import { Icon } from '@tindivo/ui'
import { labelEmoji } from '@/components/address-fields'
import type { Address } from '@/features/account/types'

interface DefaultAddressCardProps {
  address?: Address
  onAdd: () => void
  onEdit: (address: Address) => void
}

export function DefaultAddressCard({ address, onAdd, onEdit }: DefaultAddressCardProps) {
  if (!address) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 flex w-full items-center gap-3 rounded-[18px] border border-dashed border-brand/35 bg-brand-soft px-4 py-4 text-left transition-colors hover:bg-brand/[0.08]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Icon name="add_location_alt" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] text-brand-dark">
            Añade tu dirección de entrega
          </div>
          <div className="text-[12px] text-ink-muted">Guárdala una vez y úsala siempre.</div>
        </div>
        <Icon name="chevron_right" size={20} className="text-brand" />
      </button>
    )
  }

  return (
    <div className="mt-5 rounded-[18px] border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
          Entrega por defecto
        </span>
        <button
          type="button"
          onClick={() => onEdit(address)}
          className="inline-flex items-center gap-1 rounded-lg bg-surface-low px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:bg-ink/[0.08]"
        >
          <Icon name="edit" size={14} /> Cambiar
        </button>
      </div>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[18px]">
          {labelEmoji(address.label)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px] text-ink">{address.label}</div>
          {address.line && <div className="text-[14px] font-medium text-ink">{address.line}</div>}
          <div className="mt-0.5 text-[13px] text-ink-muted">{address.reference}</div>
        </div>
      </div>
    </div>
  )
}
