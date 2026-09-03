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
import { frameFallback, toAddressValue } from '@/lib/address-record'
import { saveAddressRow } from '@/lib/address-save'
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
  /** La fila que se está arreglando. `null` mientras se da una de alta. */
  const [editando, setEditando] = useState<Address | null>(null)
  const [manualAddr, setManualAddr] = useState<AddressValue>(EMPTY_ADDRESS)
  const [manualInside, setManualInside] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La hoja no se desmonta al cerrarse (`return null` con los hooks ya
  // corridos), así que `adding` sobreviviría de una apertura a la siguiente.
  useEffect(() => {
    if (open) {
      setAdding(startAdding)
      setEditando(null)
      setManualAddr(EMPTY_ADDRESS)
      setError(null)
    }
  }, [open, startAdding])

  if (!open) return null

  const canSave = canSaveAddress(manualAddr, manualInside)
  const falta = getMissingLabel(manualAddr, manualInside)

  /** A esta le falta algo que el cliente puede arreglar aquí mismo. */
  const arreglable = (a: Address) => !isLineOk(a.line) || a.location_confirmed_at == null

  function abrirEdicion(a: Address) {
    // `toAddressValue` es quien decide qué se rehidrata: una dirección sin
    // confirmar entra SIN punto —para que no se vuelva a sellar la plaza como
    // buena— y la precisión del sensor viaja con el punto, que es lo que evita
    // escribirle NULL encima al guardar.
    setManualAddr(toAddressValue(a))
    setEditando(a)
    setError(null)
    setAdding(true)
  }

  function volverALista() {
    setAdding(false)
    setEditando(null)
    setManualAddr(EMPTY_ADDRESS)
    setError(null)
  }

  async function guardar() {
    if (!canSave) return
    setBusy(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) {
      setBusy(false)
      setError('Se cerró tu sesión. Vuelve a entrar para guardar la dirección.')
      return
    }

    const res = await saveAddressRow({
      userId,
      previous: editando,
      value: manualAddr,
      // Un alta que no pregunta manda solo si no hay nadie mandando; una
      // edición no dice nada sobre cuál es la predeterminada.
      makeDefault: editando ? 'keep' : 'auto',
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved()
    onSelect(res.id)
    volverALista()
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
                /*
                  DOS ACCIONES EN LA MISMA TARJETA, y por eso deja de ser un
                  `<button>`: elegir esta dirección y arreglarla no son lo
                  mismo, y un botón no puede contener otro. La fila de abajo
                  cierra el callejón que este selector tenía — avisaba de que
                  faltaba la calle y la única salida era Mi cuenta.
                */
                <div
                  key={a.id}
                  className={`overflow-hidden rounded-[18px] border bg-card transition-all ${
                    sel
                      ? 'border-brand ring-2 ring-brand/30'
                      : a.location_confirmed_at == null
                        ? 'border-warning/50 shadow-elev-1'
                        : 'border-ink/[0.04] shadow-elev-1'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(a.id)
                      onClose()
                    }}
                    className="flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-ink/[0.02]"
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
                          {/* Ya no manda a Mi cuenta: el arreglo está aquí abajo. */}
                          <span>
                            Sin punto en el mapa. Márcalo para que el motorizado no se pierda.
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
                  <div className="border-ink/[0.05] border-t px-3.5 py-2">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(a)}
                      className="inline-flex items-center gap-1 font-semibold text-[12.5px] text-brand-dark transition-colors hover:text-brand active:scale-95"
                    >
                      <Icon name="edit_location_alt" size={15} />
                      {arreglable(a) ? 'Completar dirección' : 'Editar'}
                    </button>
                  </div>
                </div>
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
              frameAt={frameFallback(addresses)}
            />
            {error && (
              <p role="alert" className="-mt-1 text-danger text-sm">
                {error}
              </p>
            )}
            {/* Anclado abajo por lo mismo que en el perfil: el botón tiene que
                estar a la vista Y decir qué falta. */}
            <div className="-mx-4 -mb-6 sticky bottom-0 flex gap-2 border-ink/[0.06] border-t bg-surface px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <Button type="button" variant="ghost" onClick={volverALista}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="brand"
                onClick={guardar}
                disabled={busy || !canSave}
                className="flex-1"
              >
                {busy
                  ? 'Guardando…'
                  : (falta ?? (editando ? 'Guardar cambios' : 'Guardar dirección'))}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
