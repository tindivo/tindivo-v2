'use client'

import { Icon, ScreenHeader } from '@tindivo/ui'
import { useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  EMPTY_ADDRESS,
  labelEmoji,
} from '@/components/address-fields'
import { BottomSheet } from '@/components/ui'
import type { Address } from '@/features/checkout/types'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AddressSelectorSheetProps {
  open: boolean
  onClose: () => void
  addresses: Address[]
  addressId: string | null
  onSelect: (id: string) => void
  onSaved: () => void
}

export function AddressSelectorSheet({
  open,
  onClose,
  addresses,
  addressId,
  onSelect,
  onSaved,
}: AddressSelectorSheetProps) {
  const [adding, setAdding] = useState(false)
  const [manualAddr, setManualAddr] = useState<AddressValue>(EMPTY_ADDRESS)
  const [manualInside, setManualInside] = useState(true)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function saveNew() {
    if (!manualAddr.line.trim() || !manualAddr.reference.trim() || !manualInside) return
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
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title="Entregar en" onBack={onClose} />
      <div className="t-scroll flex-1 px-4 pt-2 pb-6">
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
                    sel ? 'border-brand shadow-focus-ring' : 'border-ink/[0.04] shadow-elev-1'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[18px]">
                    {labelEmoji(a.label)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[14px] text-ink">{a.label}</span>
                      {a.is_default && (
                        <span className="rounded-[5px] bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">
                          Por defecto
                        </span>
                      )}
                    </div>
                    {a.line && <div className="text-[13px] font-medium text-ink">{a.line}</div>}
                    <div className="mt-0.5 text-[12px] text-ink-muted">{a.reference}</div>
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
              className="t-lift flex flex-col items-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-brand/35 bg-brand-soft px-4 py-5 text-brand-dark"
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="t-btn t-btn-ghost flex-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveNew}
                disabled={
                  busy || !manualAddr.line.trim() || !manualAddr.reference.trim() || !manualInside
                }
                className="t-btn t-btn-primary flex-1"
              >
                {busy ? 'Guardando…' : 'Guardar dirección'}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
