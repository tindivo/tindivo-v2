'use client'

import { type FormEvent, useState } from 'react'
import { savePhone } from '../persistence'

/** Paso WhatsApp: el repartidor contacta aquí. Skippable (X del header). */
export function PhoneStep({
  active,
  fullName,
  email,
  userId,
  onDone,
}: {
  active: boolean
  fullName: string | null
  email: string | null
  userId: string | null
  onDone: () => void
}) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = /^9\d{8}$/.test(phone)
  const firstName = (fullName ?? '').split(' ')[0] || 'vecino'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy || !userId) return
    setBusy(true)
    setError(null)
    try {
      await savePhone({ userId, fullName: fullName ?? email ?? 'Cliente', phone })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar tu número')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <div
          className="flex items-center gap-3 rounded-[18px] bg-white p-3.5"
          style={{ border: '1px solid rgba(26,22,20,0.06)' }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-[16px] text-white"
            style={{ background: '#F97316' }}
          >
            {firstName[0]?.toUpperCase() ?? 'T'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-semibold text-[14px]">¡Hola, {firstName}!</span>
              <span
                className="rounded-[5px] px-1.5 py-0.5 font-bold text-[9px] uppercase"
                style={{ background: 'rgba(26,150,80,0.12)', color: '#1A8050' }}
              >
                Cuenta lista
              </span>
            </span>
            {email && (
              <span className="block truncate text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                {email}
              </span>
            )}
          </span>
        </div>

        <h2 className="t-display mt-5 text-[24px] leading-[1.15]">
          ¿Cuál es tu número
          <br />
          de WhatsApp?
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          El repartidor te contactará aquí si tiene alguna duda.
        </p>

        <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-border bg-white px-3.5 py-1">
          <span className="flex items-center gap-1.5 font-mono font-semibold text-[15px]">
            <span aria-hidden>🇵🇪</span> +51
          </span>
          <span className="h-6 w-px" style={{ background: 'rgba(26,22,20,0.12)' }} />
          <input
            className="h-12 w-full bg-transparent font-mono text-[17px] tracking-[0.12em] outline-none"
            placeholder="9 — — — — — — — —"
            inputMode="numeric"
            value={phone}
            maxLength={9}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            tabIndex={active ? 0 : -1}
          />
        </div>
        <p className="mt-1.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
          Debe empezar con 9 y tener 9 dígitos.
        </p>

        <div
          className="mt-4 flex items-start gap-2.5 rounded-[14px] px-3.5 py-3"
          style={{ background: 'rgba(26,150,80,0.08)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#1A8050" />
            <path
              d="M8 12.5l2.6 2.6L16 9.5"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-[12px] leading-[1.45]" style={{ color: '#14532D' }}>
            Nunca compartimos tu número. Solo lo usa el motorizado del pedido en curso.
          </p>
        </div>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>

      <div className="border-t px-4 pt-3.5 pb-6" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    </form>
  )
}
