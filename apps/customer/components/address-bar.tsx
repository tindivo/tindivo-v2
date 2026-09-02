'use client'

import { BottomSheet, Icon, ScreenHeader } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { labelEmoji } from '@/components/address-fields'
import { AddressSheet } from '@/features/account/components/address-sheet'
import { pickDefaultAddress } from '@/lib/address-record'
import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface Addr {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
}

const CITY = 'San Jacinto, Áncash'

/**
 * Barra de dirección de la topbar (estilo apps de delivery): muestra la dirección por
 * defecto del usuario con un chevron; al tocar, abre un selector para cambiarla. Si no
 * hay sesión o direcciones, muestra la etiqueta de la ciudad (comportamiento previo).
 */
export function AddressBar() {
  const [userId, setUserId] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<Addr[]>([])
  const [refreshTick, setRefreshTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const onboardingOpen = useOnboarding((s) => s.open)

  // 1) Seguimiento de sesión: solo setState, sin llamadas a Supabase (evita deadlock).
  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let active = true
    const apply = (session: { user: { id: string } } | null) => {
      if (active) setUserId(session?.user.id ?? null)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session))
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // 2) Carga de direcciones FUERA del callback de auth. Re-consulta con refreshTick.
  useEffect(() => {
    if (!userId) {
      setAddresses([])
      return
    }
    let active = true
    getSupabaseBrowser()
      .from('customer_addresses')
      .select('id,label,line,reference,is_default')
      .order('is_default', { ascending: false })
      .then(({ data }) => {
        if (active) setAddresses((data ?? []) as Addr[])
      })
    return () => {
      active = false
    }
  }, [userId, refreshTick])

  // 3) Al cerrar el onboarding, re-consultar
  useEffect(() => {
    if (!onboardingOpen) setRefreshTick((t) => t + 1)
  }, [onboardingOpen])

  const selected = pickDefaultAddress(addresses)

  async function choose(id: string) {
    if (!userId) return
    const supabase = getSupabaseBrowser()
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })))
    await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', userId)
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id)
    setOpen(false)
  }

  if (!userId || !selected) {
    return (
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
        {CITY}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-1.5 text-left group"
        aria-label="Cambiar dirección de entrega"
      >
        <span className="shrink-0 text-brand">
          <Icon name="location_on" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Entregar en
          </span>
          <span className="flex min-w-0 items-center gap-1 font-semibold text-[13px] leading-tight text-ink">
            <span className="truncate">
              {labelEmoji(selected.label)} {selected.line || selected.reference}
            </span>
            <span
              aria-hidden
              className="shrink-0 text-ink-subtle transition-transform group-hover:translate-y-0.5"
            >
              ⌄
            </span>
          </span>
        </span>
      </button>

      {open && (
        <BottomSheet open label="Entregar en" onClose={() => setOpen(false)}>
          <ScreenHeader title="Entregar en" onBack={() => setOpen(false)} as="h2" />
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-6">
            <div className="flex flex-col gap-2.5">
              {addresses.map((a) => {
                const isSelected = a.is_default || addresses.length === 1
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => choose(a.id)}
                    className={`flex items-start gap-3 rounded-[20px] p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-2 border-brand bg-card shadow-elev-1 ring-1 ring-brand/20'
                        : 'border border-border bg-card hover:border-brand/30 hover:shadow-elev-1 active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[18px]">
                      {labelEmoji(a.label)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[14px] text-ink">{a.label}</span>
                        {a.is_default && (
                          <span className="rounded-[6px] bg-brand-soft px-1.5 py-0.5 font-bold text-[9px] uppercase tracking-wide text-brand">
                            Predeterminada
                          </span>
                        )}
                      </div>
                      {a.line && (
                        <div className="mt-0.5 text-[13px] font-medium text-ink truncate">
                          {a.line}
                        </div>
                      )}
                      <div className="mt-0.5 text-[12px] text-ink-muted line-clamp-2">
                        {a.reference}
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm">
                        <Icon name="check" size={15} />
                      </span>
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full border border-ink/20" />
                    )}
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => {
                  setAddingNew(true)
                }}
                className="mt-1 flex items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-brand/35 bg-brand-soft/60 p-3.5 text-brand-dark transition-all hover:bg-brand-soft hover:shadow-elev-2 active:scale-[0.99]"
              >
                <Icon name="add" size={18} />
                <span className="font-semibold text-[13px]">Añadir nueva dirección</span>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex justify-between items-center text-[12px]">
              <span className="text-ink-muted">¿Quieres editar tus direcciones?</span>
              <Link
                href="/cuenta"
                onClick={() => setOpen(false)}
                className="font-semibold text-brand hover:text-brand-dark transition-colors"
              >
                Gestionar en mi cuenta →
              </Link>
            </div>
          </div>
        </BottomSheet>
      )}

      {addingNew && (
        <AddressSheet
          address={null}
          isFirst={addresses.length === 0}
          onClose={() => setAddingNew(false)}
          onSaved={() => {
            setAddingNew(false)
            setRefreshTick((t) => t + 1)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
