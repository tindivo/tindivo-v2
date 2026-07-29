import { labelEmoji } from '@/components/address-fields'
import { Icon } from '@tindivo/ui'
import type { Address } from '@/features/account/types'

interface AddressesListProps {
  addresses: Address[]
  onEdit: (address: Address) => void
  onAdd: () => void
  onSetDefault: (id: string) => void
}

export function AddressesList({ addresses, onEdit, onAdd, onSetDefault }: AddressesListProps) {
  return (
    <>
      <div className="mt-6 flex items-baseline justify-between">
        <div className="t-display text-[19px] text-ink">Mis direcciones</div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 font-semibold text-[13px] text-brand transition-colors hover:text-brand-dark"
        >
          <Icon name="add" size={14} /> Añadir
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
        {addresses.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="t-lift flex flex-col items-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-brand/35 bg-brand-soft px-4 py-6 text-brand-dark lg:col-span-2"
          >
            <Icon name="add_location_alt" size={22} />
            <span className="font-semibold text-[14px]">Añade tu primera dirección</span>
            <span className="text-[11px] text-ink-muted">Guárdala una vez, úsala siempre.</span>
          </button>
        ) : (
          addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onEdit={() => onEdit(a)}
              onSetDefault={() => onSetDefault(a.id)}
            />
          ))
        )}
      </div>
    </>
  )
}

function AddressCard({
  address,
  onEdit,
  onSetDefault,
}: {
  address: Address
  onEdit: () => void
  onSetDefault: () => void
}) {
  return (
    <div className="t-card t-lift flex items-start gap-3 p-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[18px]">
        {labelEmoji(address.label)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[14px] text-ink">{address.label}</span>
          {address.is_default && (
            <span className="rounded-[5px] bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">
              Por defecto
            </span>
          )}
        </div>
        {address.line && <div className="text-[13px] font-medium text-ink">{address.line}</div>}
        <div className="mt-1 text-[12px] text-ink-muted">{address.reference}</div>
        <div className="mt-2.5 flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg bg-surface-low px-2.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-ink/[0.08]"
          >
            <Icon name="edit" size={14} /> Editar
          </button>
          {!address.is_default && (
            <button
              type="button"
              onClick={onSetDefault}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-low px-2.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-ink/[0.08]"
            >
              <Icon name="star" size={14} /> Predeterminada
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
