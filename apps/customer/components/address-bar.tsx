'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { labelEmoji } from '@/components/address-fields'
import { BottomSheet, Icon, ScreenHeader } from '@/components/ui'
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
 *
 * IMPORTANTE: NO consultamos Supabase dentro del callback de `onAuthStateChange` (eso
 * provoca un deadlock en supabase-js: la query espera el mismo lock que retiene el
 * callback). En su lugar, el callback solo guarda el `userId` y un efecto separado hace
 * la query.
 */
export function AddressBar() {
  const [userId, setUserId] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<Addr[]>([])
  const [refreshTick, setRefreshTick] = useState(0)
  const [open, setOpen] = useState(false)
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

  // 2) Carga de direcciones FUERA del callback de auth (seguro). Re-consulta con refreshTick.
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

  // 3) Al cerrar el onboarding (p.ej. tras guardar la primera dirección), re-consultar
  // para que la dirección aparezca en la topbar sin recargar.
  useEffect(() => {
    if (!onboardingOpen) setRefreshTick((t) => t + 1)
  }, [onboardingOpen])

  const selected = addresses.find((a) => a.is_default) ?? addresses[0]

  async function choose(id: string) {
    const supabase = getSupabaseBrowser()
    await supabase.from('customer_addresses').update({ is_default: false }).neq('id', id)
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id)
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })))
    setOpen(false)
  }

  if (!userId || !selected) {
    return (
      <div className="t-eyebrow" style={{ fontSize: 10, letterSpacing: '0.2em' }}>
        {CITY}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-1.5 text-left"
        aria-label="Cambiar dirección de entrega"
      >
        <span className="shrink-0" style={{ color: '#F97316' }}>
          <Icon.Pin />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-eyebrow block" style={{ fontSize: 9, letterSpacing: '0.16em' }}>
            Entregar en
          </span>
          <span className="flex min-w-0 items-center gap-1 font-semibold text-[13px] leading-tight">
            <span className="truncate">
              {labelEmoji(selected.label)} {selected.line || selected.reference}
            </span>
            <span aria-hidden className="shrink-0" style={{ color: 'rgba(26,22,20,0.45)' }}>
              ⌄
            </span>
          </span>
        </span>
      </button>

      {open && (
        <BottomSheet open onClose={() => setOpen(false)}>
          <ScreenHeader title="Entregar en" onBack={() => setOpen(false)} />
          <div className="t-scroll flex-1 px-4 pt-1 pb-6">
            <div className="flex flex-col gap-2.5">
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => choose(a.id)}
                  className="flex items-start gap-3 rounded-[18px] bg-white p-3.5 text-left"
                  style={{
                    border: a.is_default ? '2px solid #F97316' : '1px solid rgba(26,22,20,0.05)',
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                    style={{ background: 'rgba(249,115,22,0.1)' }}
                  >
                    {labelEmoji(a.label)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[14px]">{a.label}</span>
                      {a.is_default && (
                        <span
                          className="rounded-[5px] px-1.5 py-0.5 font-bold text-[9px] uppercase"
                          style={{ color: '#F97316', background: 'rgba(249,115,22,0.1)' }}
                        >
                          Por defecto
                        </span>
                      )}
                    </div>
                    {a.line && (
                      <div className="text-[13px]" style={{ color: 'rgba(26,22,20,0.7)' }}>
                        {a.line}
                      </div>
                    )}
                    <div className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                      {a.reference}
                    </div>
                  </div>
                  {a.is_default && (
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Icon.Check />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Link
              href="/cuenta"
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[13px] text-brand"
            >
              <Icon.Plus style={{ width: 14, height: 14 }} /> Gestionar direcciones
            </Link>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
