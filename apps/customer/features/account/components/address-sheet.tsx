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
import type { Address } from '@/features/account/types'
import { sealLocation } from '@/lib/address-record'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AddressSheetProps {
  address: Address | null
  isFirst?: boolean
  onClose: () => void
  onSaved: (savedAddressId?: string) => void
  onDelete?: () => void
}

export function AddressSheet({
  address,
  isFirst = false,
  onClose,
  onSaved,
  onDelete,
}: AddressSheetProps) {
  /**
   * UNA DIRECCIÓN SIN CONFIRMAR ENTRA SIN PUNTO, aunque la fila tenga
   * coordenadas. Son las tres que la 0202 marcó: la app las guardó solas en el
   * centro del pueblo y nadie las eligió. Rehidratarlas dejaría el mapa en
   * verde («ubicación confirmada») sobre una plaza que no es la casa de nadie,
   * y guardar volvería a sellarla como buena. Entrando en blanco, el formulario
   * pide lo único que falta, que es un gesto.
   */
  const puntoConfirmado =
    address?.location_confirmed_at != null &&
    address.coordinates_lat != null &&
    address.coordinates_lng != null
      ? { lat: Number(address.coordinates_lat), lng: Number(address.coordinates_lng) }
      : null

  const [addr, setAddr] = useState<AddressValue>({
    label: address?.label ?? 'Casa',
    line: address?.line ?? '',
    reference: address?.reference ?? '',
    coords: puntoConfirmado,
    // La precisión viaja CON el punto. Entraba siempre en `null`, así que el
    // mapa anunciaba «ajustada a mano» sobre un GPS de ±8 m y, peor, guardar
    // escribía ese null encima de la medida buena.
    accuracyM: puntoConfirmado ? (address?.location_accuracy_m ?? null) : null,
  })
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
      return
    }

    // `esPrimera` gana sobre el interruptor: es la única dirección que hay, así
    // que dejarla sin marcar produciría un usuario con direcciones y ninguna
    // predeterminada — el agujero que ya abrió el alta del checkout.
    const seraPredeterminada = esPrimera || isDefault

    if (seraPredeterminada) {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', userId)
    }

    const payload = {
      label: addr.label,
      line: addr.line.trim(),
      reference: addr.reference.trim(),
      is_default: seraPredeterminada,
      coordinates_lat: addr.coords?.lat ?? null,
      coordinates_lng: addr.coords?.lng ?? null,
      // El sello lo mueve el PUNTO, no el formulario: si la coordenada no
      // cambió, la confirmación y los metros del sensor que ya había siguen
      // siendo los buenos. Ver `sealLocation`.
      ...sealLocation(address, addr, new Date().toISOString()),
    }

    if (address) {
      const { error: err } = await supabase
        .from('customer_addresses')
        .update(payload)
        .eq('id', address.id)
      if (err) {
        setError(err.message)
        setBusy(false)
      } else {
        onSaved(address.id)
      }
    } else {
      const { data: created, error: err } = await supabase
        .from('customer_addresses')
        .insert({ ...payload, user_id: userId })
        .select('id')
        .single()
      if (err) {
        setError(err.message)
        setBusy(false)
      } else {
        onSaved(created?.id)
      }
    }
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
          <AddressFields value={addr} onChange={patch} onValidityChange={setInsideZone} />
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
