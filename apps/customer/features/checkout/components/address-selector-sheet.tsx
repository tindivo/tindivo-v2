'use client'

import { BottomSheet, Button, Icon, ScreenHeader } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  canSaveAddress,
  EMPTY_ADDRESS,
  getMissingLabel,
  isLineOk,
} from '@/components/address-fields'
import { type Address, addressIcon } from '@/features/checkout/types'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AddressSelectorSheetProps {
  open: boolean
  onClose: () => void
  addresses: Address[]
  addressId: string | null
  onSelect: (id: string) => void
  onSaved: () => void
  /**
   * Abrir directamente en el formulario, saltándose la lista.
   *
   * Lo usa el CTA cuando el cliente NO tiene ninguna dirección guardada: en ese
   * caso la lista está vacía y lo único que hay es el botón «Agregar nueva
   * dirección», así que enseñarla es cobrar un toque por nada.
   */
  startAdding?: boolean
}

export function AddressSelectorSheet({
  open,
  onClose,
  addresses,
  addressId,
  onSelect,
  onSaved,
  startAdding = false,
}: AddressSelectorSheetProps) {
  const [adding, setAdding] = useState(startAdding)
  const [manualAddr, setManualAddr] = useState<AddressValue>(EMPTY_ADDRESS)
  const [manualInside, setManualInside] = useState(true)
  const [busy, setBusy] = useState(false)

  // La hoja no se desmonta al cerrarse (`return null` con los hooks ya
  // corridos), así que `adding` sobreviviría de una apertura a la siguiente.
  useEffect(() => {
    if (open) setAdding(startAdding)
  }, [open, startAdding])

  if (!open) return null

  const canSave = canSaveAddress(manualAddr, manualInside)
  const falta = getMissingLabel(manualAddr, manualInside)
  /**
   * ESTA RAMA SE ABRE SOLA CUANDO NO HAY NINGUNA DIRECCIÓN (el checkout la pone
   * en modo alta con `addresses.length === 0`), y el INSERT no ponía
   * `is_default`, así que caía al `false` de la columna. Resultado medido en
   * prod: dos de veintisiete usuarios con direcciones y ninguna predeterminada.
   * A esos, `cart-business-gate` —que consulta `.eq('is_default', true)` sin
   * plan B— les manda al negocio el mensaje de WhatsApp SIN dirección.
   *
   * No hace falta limpiar las demás: si es la primera, no hay otras.
   */
  const esPrimera = addresses.length === 0

  async function saveNew() {
    if (!canSave) return
    setBusy(true)
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) {
      setBusy(false)
      return
    }
    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        user_id: userId,
        label: manualAddr.label,
        line: manualAddr.line.trim(),
        reference: manualAddr.reference.trim(),
        coordinates_lat: manualAddr.coords?.lat ?? null,
        coordinates_lng: manualAddr.coords?.lng ?? null,
        location_confirmed_at: new Date().toISOString(),
        location_accuracy_m: manualAddr.accuracyM,
        is_default: esPrimera,
      })
      .select('id')
      .single()
    setBusy(false)
    if (error || !data) return
    onSaved()
    onSelect(data.id)
    setAdding(false)
    setManualAddr(EMPTY_ADDRESS)
    onClose()
  }

  return (
    <BottomSheet open label="Entregar en" onClose={onClose}>
      <ScreenHeader title="Entregar en" onBack={onClose} as="h2" />
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-6 scrollbar-hide">
        {!adding ? (
          <div className="flex flex-col gap-2.5">
            {addresses.map((a) => {
              const sel = a.id === addressId
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onSelect(a.id)
                    onClose()
                  }}
                  className={`flex items-start gap-3 rounded-[18px] border bg-card p-3.5 text-left transition-all ${
                    sel
                      ? 'border-brand ring-2 ring-brand/30'
                      : a.location_confirmed_at == null
                        ? 'border-warning/50 shadow-elev-1'
                        : 'border-ink/[0.04] shadow-elev-1'
                  }`}
                >
                  <div
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark"
                  >
                    <Icon name={addressIcon(a.label)} size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[14px] text-ink">{a.label}</span>
                      {a.is_default && (
                        <span className="rounded-[5px] bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">
                          Por defecto
                        </span>
                      )}
                      {!isLineOk(a.line) && (
                        <span className="rounded-[5px] bg-danger-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-danger">
                          Falta calle
                        </span>
                      )}
                      {/* No bloquea el pedido: avisa. La cajera llama a todos
                          igual, y quitarle el pedido a quien no entienda esta
                          pantalla cuesta más que un punto flojo. */}
                      {a.location_confirmed_at == null && (
                        <span className="rounded-[5px] bg-warning-soft px-1.5 py-0.5 text-[9px] font-bold text-amber-900 uppercase">
                          Sin ubicación
                        </span>
                      )}
                    </div>
                    {a.line ? (
                      <div className="text-[13px] font-medium text-ink">{a.line}</div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1 font-medium text-[12px] text-danger">
                        <Icon name="error" size={13} aria-hidden />
                        Falta calle/número
                      </div>
                    )}
                    <div className="mt-0.5 text-[12px] text-ink-muted">{a.reference}</div>
                    {a.location_confirmed_at == null && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[#78350f] leading-snug">
                        <Icon name="wrong_location" size={13} className="mt-px shrink-0" />
                        <span>
                          Sin punto en el mapa. Arréglala desde <strong>Mi cuenta</strong> para que
                          el motorizado no se pierda.
                        </span>
                      </div>
                    )}
                  </div>
                  {sel && (
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Icon name="check" size={16} filled />
                    </span>
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex flex-col items-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-brand/35 bg-brand-soft px-4 py-5 text-brand-dark transition-all hover:-translate-y-0.5 hover:shadow-elev-3 active:translate-y-0 active:scale-[0.985]"
            >
              <Icon name="add_location_alt" size={22} />
              <span className="font-semibold text-[14px]">Agregar nueva dirección</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <AddressFields
              value={manualAddr}
              onChange={(p) => setManualAddr((a) => ({ ...a, ...p }))}
              onValidityChange={setManualInside}
            />
            {/* Anclado abajo por lo mismo que en el perfil: el botón tiene que
                estar a la vista Y decir qué falta. */}
            <div className="-mx-4 -mb-6 sticky bottom-0 flex gap-2 border-ink/[0.06] border-t bg-surface px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="brand"
                onClick={saveNew}
                disabled={busy || !canSave}
                className="flex-1"
              >
                {busy ? 'Guardando…' : (falta ?? 'Guardar dirección')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
