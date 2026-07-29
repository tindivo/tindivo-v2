import { labelEmoji } from '@/components/address-fields'
import { Icon } from '@/components/ui'
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
        <div className="t-display text-[19px]">Mis direcciones</div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 font-semibold text-[13px] text-brand"
        >
          <Icon.Plus className="h-3.5 w-3.5" /> Añadir
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
        {addresses.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-col items-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.04)] px-4 py-6 text-[#C2410C] lg:col-span-2"
          >
            <Icon.Plus className="h-[22px] w-[22px]" />
            <span className="font-semibold text-[14px]">Añade tu primera dirección</span>
            <span className="text-[11px] text-ink/55">Guárdala una vez, úsala siempre.</span>
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
    <div className="flex items-start gap-3 rounded-[18px] border border-border bg-white p-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(249,115,22,0.1)] text-[18px]">
        {labelEmoji(address.label)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[14px]">{address.label}</span>
          {address.is_default && (
            <span className="rounded-[5px] bg-[rgba(249,115,22,0.1)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#F97316]">
              Por defecto
            </span>
          )}
        </div>
        {address.line && <div className="text-[13px] font-medium text-ink/85">{address.line}</div>}
        <div className="mt-1 text-[12px] text-ink/55">{address.reference}</div>
        <div className="mt-2.5 flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] font-medium"
          >
            Editar
          </button>
          {!address.is_default && (
            <button
              type="button"
              onClick={onSetDefault}
              className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] font-medium"
            >
              Predeterminada
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
