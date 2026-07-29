'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { AddressFields, type AddressValue, isReferenceOk } from '@/components/address-fields'
import { BottomSheet, ScreenHeader } from '@/components/ui'
import type { Address } from '@/features/account/types'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AddressSheetProps {
  address: Address | null
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}

export function AddressSheet({ address, onClose, onSaved, onDelete }: AddressSheetProps) {
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
  const [isDefault, setIsDefault] = useState(address?.is_default ?? false)
  const [insideZone, setInsideZone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSave = isReferenceOk(addr.reference) && insideZone

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
    if (!userId) return
    if (isDefault) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .neq('id', address?.id ?? '')
    }
    const payload = {
      label: addr.label,
      line: addr.line.trim() || null,
      reference: addr.reference.trim(),
      is_default: isDefault,
      coordinates_lat: addr.coords?.lat ?? null,
      coordinates_lng: addr.coords?.lng ?? null,
    }
    const { error: err } = address
      ? await supabase.from('customer_addresses').update(payload).eq('id', address.id)
      : await supabase.from('customer_addresses').insert({ ...payload, user_id: userId })
    if (err) {
      setError(err.message)
      setBusy(false)
    } else {
      onSaved()
    }
  }

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title={address ? 'Editar dirección' : 'Nueva dirección'} onBack={onClose} />
      <form onSubmit={save} className="t-scroll flex-1 px-4 pt-2 pb-6">
        <div className="mb-4">
          <AddressFields
            value={addr}
            onChange={patch}
            onValidityChange={setInsideZone}
            mapHeightPx={160}
          />
        </div>

        <button
          type="button"
          onClick={() => setIsDefault((d) => !d)}
          className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-white p-3.5 text-left"
        >
          <span
            className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
              isDefault ? 'bg-[#F97316]' : 'bg-black/15'
            }`}
          >
            <span
              className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
                isDefault ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </span>
          <span className="flex-1">
            <span className="block font-medium text-[14px]">Usar como predeterminada</span>
            <span className="block text-[11px] text-ink/55">Aparece primero al pedir.</span>
          </span>
        </button>

        {error && <p className="mt-3 text-danger text-sm">{error}</p>}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3.5 w-full rounded-[14px] bg-[rgba(220,38,38,0.06)] px-4 py-3.5 font-semibold text-[14px] text-[#DC2626]"
          >
            Eliminar dirección
          </button>
        )}
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block mt-4"
          disabled={!canSave || busy}
        >
          {busy ? 'Guardando…' : address ? 'Guardar cambios' : 'Guardar dirección'}
        </button>
      </form>
    </BottomSheet>
  )
}
