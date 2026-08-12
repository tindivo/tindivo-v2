'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { useState } from 'react'
import type { DirectoryAddress } from '../hooks/use-address-lookup'
import { formatPhone, initialOf, relativeLastUsed, timesUsedLabel } from '../lib/address-format'

/**
 * Selector cuando un teléfono tiene varias direcciones (spec_ui_cajera.md B3).
 *
 * NO ES UN RINCÓN QUE SE PORTA POR COMPLETITUD. Medido en el directorio real:
 * 72 de 616 teléfonos (11,7%) tienen más de una dirección, y su peso sobre los
 * pedidos es mayor todavía, porque el cliente con varias direcciones es el
 * frecuente — el mismo que concentra el volumen. Es camino regular.
 *
 * Y ELEGIR MAL MANDA EL PEDIDO A LA CASA EQUIVOCADA (B3-bis). De ahí las dos
 * decisiones que gobiernan este componente:
 *
 *   · LA REFERENCIA NO SE TRUNCA NUNCA. Las reales son largas y lo que las
 *     distingue está AL FINAL: "SAN JOSE BAJO - LADO A BUSTAMANTE" contra
 *     "SAN JOSE BAJO - RECTA DEL KINDER". Una elipsis borra justo el trozo que
 *     permite elegir bien. Se envuelve en varias líneas y se acabó.
 *   · Los metadatos (última vez, cuántos pedidos, GPS) están para desempatar
 *     cuando dos referencias se parecen.
 */
export function AddressPickerModal({
  addresses,
  onPick,
  onWriteNew,
  onClose,
}: {
  addresses: DirectoryAddress[]
  onPick: (address: DirectoryAddress) => void
  /** "Escribir dirección nueva": limpia y deja los campos en blanco. */
  onWriteNew: () => void
  onClose: () => void
}) {
  // Primera preseleccionada. El RPC ya las devuelve ordenadas
  // (is_default DESC, last_used_at DESC), así que la primera es la más probable.
  const [selectedId, setSelectedId] = useState<string>(addresses[0]?.id ?? '')

  const customerName = addresses.find((a) => a.customerName)?.customerName ?? null
  const phone = addresses[0]?.phone ?? ''

  const confirm = () => {
    if (selectedId === NEW_ADDRESS) {
      onWriteNew()
      return
    }
    const picked = addresses.find((a) => a.id === selectedId)
    if (picked) onPick(picked)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
      <div className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-card max-h-[85vh]">
        {/* Encabezado con el cliente: la cajera confirma en voz alta con quién
            habla antes de elegir dónde manda la moto. */}
        <div className="flex items-center gap-3 border-b border-ink/[0.06] px-4 py-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-lg font-bold text-brand">
            {initialOf(customerName)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-bold text-ink">
              {customerName ?? 'Cliente sin nombre'}
            </h2>
            <p className="font-mono text-[12px] text-ink-muted">{formatPhone(phone)}</p>
          </div>
          <IconButton size="sm" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        {/* El texto se adapta al caso de UNA dirección, que es el 88% de los
            clientes conocidos. "1 direcciones guardadas" delata que nadie miró
            esta pantalla con datos reales. */}
        <div className="border-b border-ink/[0.06] bg-ink/[0.02] px-4 py-2">
          <p className="text-[13px] font-semibold text-ink">
            {addresses.length === 1
              ? 'Este cliente tiene una dirección guardada'
              : `Este cliente tiene ${addresses.length} direcciones guardadas`}
          </p>
          <p className="text-[12px] text-ink-muted">
            {addresses.length === 1
              ? 'Confirma con el cliente si el pedido va ahí.'
              : 'Pregúntale a cuál va el pedido.'}
          </p>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto p-3.5">
          {addresses.map((address) => {
            const selected = address.id === selectedId
            const used = timesUsedLabel(address.timesUsed)
            return (
              <button
                key={address.id}
                type="button"
                onClick={() => setSelectedId(address.id)}
                className={`flex w-full cursor-pointer gap-3 rounded-xl border p-3 text-left transition-colors ${
                  selected ? 'border-brand bg-brand/[0.06]' : 'border-ink/[0.08] bg-card'
                }`}
              >
                {/* Radio con el color primario. En el legacy era azul y rompía
                    la paleta naranja/coral de la app (FIX #5). */}
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-brand' : 'border-ink/25'
                  }`}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                </span>

                <span className="min-w-0 flex-1">
                  {/* `break-words` y sin `truncate`: ver B3-bis arriba. */}
                  <span className="block break-words text-[14px] font-semibold leading-snug text-ink">
                    {address.reference}
                  </span>

                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted">
                    {address.customerName && (
                      <span className="font-semibold text-ink-muted">{address.customerName}</span>
                    )}
                    <span>{relativeLastUsed(address.lastUsedAt)}</span>
                    {used && <span>· {used}</span>}
                    {/* El badge SOLO si de verdad lleva coordenada. Mentir aquí
                        se paga en la calle: el motorizado cuenta con ese mapa. */}
                    {address.hasGps && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-1.5 py-0.5 font-semibold text-success">
                        <Icon name="my_location" size={11} filled /> GPS
                      </span>
                    )}
                    {address.isDefault && (
                      <span className="rounded-full bg-ink/[0.06] px-1.5 py-0.5 font-semibold">
                        Principal
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )
          })}

          {/* Última opción, siempre. El cliente puede estar pidiendo a un sitio
              nuevo y no hay que obligarlo a cancelar para escribirlo. */}
          <button
            type="button"
            onClick={() => setSelectedId(NEW_ADDRESS)}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors ${
              selectedId === NEW_ADDRESS ? 'border-brand bg-brand/[0.06]' : 'border-ink/20 bg-card'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                selectedId === NEW_ADDRESS ? 'border-brand' : 'border-ink/25'
              }`}
            >
              {selectedId === NEW_ADDRESS && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
            </span>
            <span className="text-[14px] font-semibold text-ink">Escribir dirección nueva</span>
          </button>
        </div>

        <div className="flex gap-2 border-t border-ink/[0.06] px-3.5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 cursor-pointer rounded-full border border-ink/[0.12] bg-card text-[15px] font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!selectedId}
            className="h-11 flex-[2] cursor-pointer rounded-full bg-brand text-[15px] font-bold text-white transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Centinela de "dirección nueva" en el estado de selección. No es un id real,
 *  así que no puede colisionar con el uuid de una fila del directorio. */
const NEW_ADDRESS = '__new__'
