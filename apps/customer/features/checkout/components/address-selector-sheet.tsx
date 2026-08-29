'use client'

import { BottomSheet, Button, Icon, ScreenHeader } from '@tindivo/ui'
import { useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  EMPTY_ADDRESS,
  isLineOk,
  isReferenceOk,
  labelEmoji,
} from '@/components/address-fields'
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

  const canSave = isLineOk(manualAddr.line) && isReferenceOk(manualAddr.reference) && manualInside

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
                    sel ? 'border-brand ring-2 ring-brand/30' : 'border-ink/[0.04] shadow-elev-1'
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
                      {!isLineOk(a.line) && (
                        <span className="rounded-[5px] bg-danger-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-danger">
                          Falta calle
                        </span>
                      )}
                    </div>
                    {a.line ? (
                      <div className="text-[13px] font-medium text-ink">{a.line}</div>
                    ) : (
                      <div className="mt-0.5 text-[12px] font-medium text-danger">
                        ⚠️ Falta calle/número
                      </div>
                    )}
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
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdding(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="brand"
                onClick={saveNew}
                disabled={busy || !canSave}
                className="flex-1"
              >
                {busy ? 'Guardando…' : 'Guardar dirección'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
