import { Badge, Card, Icon } from '@tindivo/ui'
import { labelEmoji } from '@/components/address-fields'
import type { Address } from '@/features/account/types'

interface AddressesListProps {
  addresses: Address[]
  onEdit: (address: Address) => void
  onAdd: () => void
  onSetDefault: (id: string) => void
}

export function AddressesList({ addresses, onEdit, onAdd, onSetDefault }: AddressesListProps) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-bold tracking-tight text-[19px] text-ink">
            Mis direcciones
          </h2>
          {addresses.length > 0 && (
            <span className="rounded-full bg-surface-low px-2 py-0.5 text-[11px] font-bold text-ink-muted">
              {addresses.length}
            </span>
          )}
        </div>
        {addresses.length > 0 && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 font-semibold text-[13px] text-brand transition-colors hover:text-brand-dark active:scale-95"
          >
            <Icon name="add" size={16} /> Añadir
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-2">
        {addresses.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-brand/35 bg-brand-soft/50 p-6 text-brand-dark transition-all hover:bg-brand-soft hover:shadow-elev-2 active:scale-[0.99] lg:col-span-2"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Icon name="add_location_alt" size={24} />
            </span>
            <span className="font-semibold text-[15px]">Añade tu primera dirección</span>
            <span className="text-[12px] text-ink-muted text-center max-w-xs">
              Guárdala una vez y úsala siempre para recibir tus pedidos de forma rápida.
            </span>
          </button>
        ) : (
          <>
            {addresses.map((a) => (
              <AddressCard
                key={a.id}
                address={a}
                onEdit={() => onEdit(a)}
                onSetDefault={() => onSetDefault(a.id)}
              />
            ))}

            <button
              type="button"
              onClick={onAdd}
              className="flex items-center justify-center gap-2 rounded-[18px] border border-dashed border-ink/20 bg-surface-low/40 p-4 text-ink-muted transition-all hover:border-brand/40 hover:bg-brand-soft/30 hover:text-brand active:scale-[0.99]"
            >
              <Icon name="add" size={18} />
              <span className="font-semibold text-[13px]">Añadir otra dirección</span>
            </button>
          </>
        )}
      </div>
    </section>
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
  /**
   * El punto de esta dirección no lo eligió nadie: lo plantó la app en el
   * centro del pueblo (migración 0202). No se bloquea nada —se puede seguir
   * pidiendo—, pero se dice y se ofrece arreglarlo en un toque, porque el
   * motorizado sale hacia la plaza con ella.
   */
  const sinUbicacion = address.location_confirmed_at == null

  return (
    <Card
      className={`flex items-start gap-3.5 p-4 transition-all rounded-[20px] ${
        sinUbicacion
          ? 'border-warning/50 bg-card shadow-elev-1'
          : address.is_default
            ? 'border-brand/40 bg-card ring-1 ring-brand/20 shadow-elev-1'
            : 'border-border bg-card hover:shadow-elev-1'
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-[20px] shadow-sm">
        {labelEmoji(address.label)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[15px] text-ink">{address.label}</span>
          {address.is_default && (
            <Badge variant="brand" size="sm" className="font-bold tracking-wide text-[10px]">
              Predeterminada
            </Badge>
          )}
          {sinUbicacion && (
            <Badge variant="warning" size="sm" className="font-bold tracking-wide text-[10px]">
              Sin ubicación
            </Badge>
          )}
        </div>

        {address.line && (
          <div className="mt-0.5 text-[13px] font-medium text-ink leading-snug truncate">
            {address.line}
          </div>
        )}

        <div className="mt-1 text-[12px] text-ink-muted leading-relaxed line-clamp-2">
          {address.reference}
        </div>

        {sinUbicacion && (
          <div className="mt-2.5 flex items-start gap-2 rounded-[14px] bg-warning-soft px-3 py-2.5">
            <Icon name="wrong_location" size={16} className="mt-px shrink-0 text-[#b45309]" />
            <span className="min-w-0 flex-1 text-[12px] text-[#78350f] leading-snug">
              No llegamos a saber en qué punto del mapa queda. El motorizado sale con el centro del
              pueblo y puede perderse.
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {sinUbicacion && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-xl bg-[linear-gradient(135deg,#d97706,#f59e0b)] px-3 py-1.5 text-[12px] font-bold text-white transition-transform active:scale-95"
            >
              <Icon name="add_location_alt" size={14} /> Marcar en el mapa
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-xl bg-surface-low px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-ink/[0.08] active:scale-95"
          >
            <Icon name="edit" size={14} /> Editar
          </button>

          {!address.is_default && (
            <button
              type="button"
              onClick={onSetDefault}
              className="inline-flex items-center gap-1 rounded-xl bg-surface-low px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand active:scale-95"
            >
              <Icon name="star" size={14} /> Hacer predeterminada
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
