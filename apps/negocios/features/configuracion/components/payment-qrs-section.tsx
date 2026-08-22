'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { usePaymentQrs } from '../hooks/use-payment-qrs'
import { PaymentQrCard } from './payment-qr-card'

/**
 * Las cuentas de cobro del negocio (0184).
 *
 * Hasta dos, y la segunda no es un lujo: el QR impreso se moja, se raya o se
 * subió mal escaneado, y en la puerta del cliente no hay segunda oportunidad.
 * Tener una de repuesto es la diferencia entre un toque en la pantalla del
 * motorizado y ponerse a dictar nueve dígitos.
 */
export function PaymentQrsSection() {
  const { items, defaultSlot, freeSlot, loading, busySlot, error, save, remove, makeDefault } =
    usePaymentQrs()
  const [adding, setAdding] = useState(false)

  if (loading) {
    return <p className="text-[13px] text-ink-muted">Cargando tus cuentas de cobro…</p>
  }

  const showNew = adding && freeSlot !== null

  return (
    <div className="flex flex-col gap-3">
      {items.map((qr) => (
        <PaymentQrCard
          key={qr.slot}
          slot={qr.slot}
          existing={qr}
          isDefault={qr.slot === defaultSlot}
          busy={busySlot === qr.slot}
          onMakeDefault={items.length > 1 ? () => makeDefault(qr.slot) : null}
          onSave={save}
          // La última cuenta no se puede quitar: sin ninguna, el cliente se
          // queda sin a quién pagarle y el pedido prepago no puede avanzar.
          onRemove={items.length > 1 ? () => remove(qr.slot) : null}
        />
      ))}

      {showNew && (
        <PaymentQrCard
          slot={freeSlot}
          existing={null}
          isDefault={items.length === 0}
          busy={busySlot === freeSlot}
          onMakeDefault={null}
          onSave={async (draft) => {
            const okSaved = await save(draft)
            if (okSaved) setAdding(false)
            return okSaved
          }}
          onRemove={() => setAdding(false)}
        />
      )}

      {!showNew && freeSlot !== null && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 text-[14px] font-bold text-ink-muted transition-colors hover:bg-surface"
        >
          <Icon name="add" size={18} />
          {items.length === 0 ? 'Agregar cuenta de cobro' : 'Agregar cuenta de repuesto'}
        </button>
      )}

      {freeSlot === null && (
        <p className="text-[12px] text-ink-muted">
          Ya tienes las dos cuentas que se pueden cargar. Para cambiar una, edítala o quítala.
        </p>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
