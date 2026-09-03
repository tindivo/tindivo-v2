'use client'

import { BottomSheet, Button, ScreenHeader } from '@tindivo/ui'
import type { FormEvent } from 'react'
import { useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  canSaveAddress,
  getMissingLabel,
} from '@/components/address-fields'
import type { LatLng } from '@/components/map-picker'
import { type SavedAddress, toAddressValue } from '@/lib/address-record'
import { saveAddressRow } from '@/lib/address-save'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AddressSheetProps {
  address: SavedAddress | null
  isFirst?: boolean
  /**
   * Por dónde encuadrar el mapa mientras no haya punto. Lo elige
   * `frameFallback` con la libreta del cliente: su barrio en vez de la plaza.
   */
  frameAt?: LatLng | null
  onClose: () => void
  onSaved: (savedAddressId?: string) => void
  onDelete?: () => void
}

export function AddressSheet({
  address,
  isFirst = false,
  frameAt = null,
  onClose,
  onSaved,
  onDelete,
}: AddressSheetProps) {
  const [addr, setAddr] = useState<AddressValue>(() => toAddressValue(address))
  /**
   * ANTES ESTO ERA `isFirst || true`, o sea `true` a secas: la prop `isFirst`
   * llegaba de dos sitios y no la miraba nadie. Consecuencia: TODA dirección
   * nueva abría con el interruptor encendido, y como `save()` empieza poniendo
   * `is_default = false` a todas las del usuario, quien añadía «Trabajo» se
   * quedaba con Trabajo como dirección por defecto de sus pedidos sin haberlo
   * pedido ni enterarse.
   *
   * La primera dirección es un caso aparte: no es que convenga que sea la
   * predeterminada, es que no puede ser otra cosa. Por eso ni se pregunta.
   */
  const [isDefault, setIsDefault] = useState(address ? address.is_default : isFirst)
  const [insideZone, setInsideZone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** No hay otra dirección: esta será la predeterminada quiera o no. */
  const esPrimera = address == null && isFirst
  const canSave = canSaveAddress(addr, insideZone)
  const falta = getMissingLabel(addr, insideZone)

  function patch(p: Partial<AddressValue>) {
    setAddr((a) => ({ ...a, ...p }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
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

    // `esPrimera` gana sobre el interruptor: es la única dirección que hay, así
    // que dejarla sin marcar produciría un usuario con direcciones y ninguna
    // predeterminada.
    const res = await saveAddressRow({
      userId,
      previous: address,
      value: addr,
      makeDefault: esPrimera || isDefault,
    })
    if (!res.ok) {
      setError(res.error)
      setBusy(false)
      return
    }
    onSaved(res.id)
  }

  // Un solo sitio para el título: lo pinta el header y nombra el diálogo. Si se
  // escribiera dos veces, un cambio de copy dejaría el nombre accesible viejo.
  const titulo = address ? 'Editar dirección' : 'Nueva dirección'

  return (
    <BottomSheet open label={titulo} onClose={onClose}>
      <ScreenHeader title={titulo} onBack={onClose} as="h2" />
      <form
        onSubmit={save}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-2 pb-6"
      >
        <div className="mb-4">
          <AddressFields
            value={addr}
            onChange={patch}
            onValidityChange={setInsideZone}
            frameAt={frameAt}
          />
        </div>

        {!esPrimera && (
          <button
            type="button"
            onClick={() => setIsDefault((d) => !d)}
            className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-card p-3.5 text-left transition-colors hover:bg-surface-low/50"
          >
            <span
              className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
                isDefault ? 'bg-brand' : 'bg-ink/[0.15]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
                  isDefault ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-[14px] text-ink">
                Usar como predeterminada
              </span>
              <span className="block text-[12px] text-ink-muted">
                Se seleccionará automáticamente al hacer un pedido.
              </span>
            </span>
          </button>
        )}

        {error && <p className="mt-3 text-danger text-sm">{error}</p>}

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3.5 w-full rounded-[14px] bg-danger-soft px-4 py-3.5 font-semibold text-[14px] text-danger transition-colors hover:bg-danger/10 active:scale-[0.99]"
          >
            Eliminar dirección
          </button>
        )}

        {/*
          ANCLADO ABAJO, NO AL FINAL DEL SCROLL.
          Con el mapa arriba y el botón al final de la hoja, quien escribía la
          referencia ya no veía el mapa y el botón ya estaba en naranja: nada lo
          devolvía a marcar su ubicación. Pegado abajo el botón está siempre a
          la vista y, cuando no se puede guardar, DICE qué falta en vez de
          quedarse mudo y apagado.
        */}
        <div className="-mx-4 -mb-6 sticky bottom-0 mt-4 border-ink/[0.06] border-t bg-surface px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <Button type="submit" variant="brand" className="w-full" disabled={!canSave || busy}>
            {busy ? 'Guardando…' : (falta ?? (address ? 'Guardar cambios' : 'Guardar dirección'))}
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}
