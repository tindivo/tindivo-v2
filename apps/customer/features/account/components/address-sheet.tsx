'use client'

import { BottomSheet, Button, ScreenHeader } from '@tindivo/ui'
import type { FormEvent } from 'react'
import { useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  isLineOk,
  isReferenceOk,
} from '@/components/address-fields'
import type { Address } from '@/features/account/types'
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
  const [addr, setAddr] = useState<AddressValue>({
    label: address?.label ?? 'Casa',
    line: address?.line ?? '',
    reference: address?.reference ?? '',
    coords:
      address?.coordinates_lat != null && address?.coordinates_lng != null
        ? { lat: Number(address.coordinates_lat), lng: Number(address.coordinates_lng) }
        : null,
    accuracyM: null,
  })
  const [isDefault, setIsDefault] = useState(address ? address.is_default : isFirst || true)
  const [insideZone, setInsideZone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSave = isLineOk(addr.line) && isReferenceOk(addr.reference) && insideZone

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

    if (isDefault) {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', userId)
    }

    const payload = {
      label: addr.label,
      line: addr.line.trim(),
      reference: addr.reference.trim(),
      is_default: isDefault,
      coordinates_lat: addr.coords?.lat ?? null,
      coordinates_lng: addr.coords?.lng ?? null,
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

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title={address ? 'Editar dirección' : 'Nueva dirección'} onBack={onClose} />
      <form
        onSubmit={save}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-2 pb-6"
      >
        <div className="mb-4">
          <AddressFields value={addr} onChange={patch} onValidityChange={setInsideZone} />
        </div>

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

        <Button type="submit" variant="brand" className="mt-4 w-full" disabled={!canSave || busy}>
          {busy ? 'Guardando…' : address ? 'Guardar cambios' : 'Guardar dirección'}
        </Button>
      </form>
    </BottomSheet>
  )
}
