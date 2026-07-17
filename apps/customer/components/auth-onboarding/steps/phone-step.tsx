'use client'

import { type FormEvent, useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'
import { ApiError } from '@tindivo/api-client'

type PhoneStepPhase = 'input' | 'verify'

/** Paso Celular / SMS: el repartidor contacta aquí. Soporta modo onboarding y gate de checkout. */
export function PhoneStep({
  active,
  fullName,
  email,
  userId,
  onDone,
  mode = 'onboarding',
}: {
  active: boolean
  fullName: string | null
  email: string | null
  userId: string | null
  onDone: () => void
  mode?: 'onboarding' | 'gate'
}) {
  const [phase, setPhase] = useState<PhoneStepPhase>('input')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null)

  const isPhoneValid = /^9\d{8}$/.test(phone)
  const isCodeValid = code.length === 6
  const firstName = (fullName ?? '').split(' ')[0] || 'vecino'

  // Limpiar timers al desmontar
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    }
  }, [])

  // Auto-submit OTP cuando llega a 6 dígitos
  useEffect(() => {
    if (phase === 'verify' && code.length === 6 && !busy) {
      handleVerifyCode()
    }
  }, [code, phase])

  function startCooldown() {
    setCooldown(60)
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleSendCode(e?: FormEvent) {
    if (e) e.preventDefault()
    if (!isPhoneValid || busy) return
    setBusy(true)
    setError(null)

    try {
      await api.post<{ sent: boolean; channel: string }>('/customer/phone/send-code', { phone })
      setPhase('verify')
      startCooldown()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError('Demasiados intentos. Intenta mañana.')
        } else if (err.status === 503) {
          setError('Verificación de teléfono no disponible temporalmente.')
        } else {
          setError(err.message ?? 'Error al enviar código')
        }
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo enviar el código por SMS')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyCode(e?: FormEvent) {
    if (e) e.preventDefault()
    if (!isCodeValid || busy) return
    setBusy(true)
    setError(null)

    try {
      await api.post<{ verified: boolean; phone: string }>('/customer/phone/verify', {
        phone,
        code,
      })
      onDone()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('Este número ya está registrado en otra cuenta. Si es tuyo, cierra sesión e inicia con esa cuenta.')
          setPhase('input')
          setCode('')
          return
        }
        setError(err.message ?? 'Código incorrecto. Intenta de nuevo.')
      } else {
        setError(err instanceof Error ? err.message : 'Código incorrecto. Intenta de nuevo.')
      }
      setCode('') // Limpiar input de código ante error
    } finally {
      setBusy(false)
    }
  }

  const maskedPhone =
    phone.length === 9
      ? `${phone.slice(0, 3)} *** ${phone.slice(-3)}`
      : phone

  if (phase === 'input') {
    return (
      <form onSubmit={handleSendCode} className="flex h-full flex-col">
        <div className="t-scroll flex-1 px-5 pt-2 pb-4">
          {mode === 'onboarding' && (
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
                  <span className="block truncate text-[12px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
                    {email}
                  </span>
                )}
              </span>
            </div>
          )}

          <h2 className="t-display mt-5 text-[24px] leading-[1.15]">
            {mode === 'gate' ? 'Verifica tu celular\npara pedir' : '¿Cuál es tu número\nde celular?'}
          </h2>
          <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
            Te enviaremos un código por SMS para confirmar tu número.
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
            disabled={!isPhoneValid || busy}
            tabIndex={active ? 0 : -1}
          >
            {busy ? 'Enviando código…' : 'Enviar código por SMS'}
          </button>
        </div>
      </form>
    )
  }

  // Phase: verify
  return (
    <form onSubmit={handleVerifyCode} className="flex h-full flex-col">
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <h2 className="t-display text-[24px] leading-[1.15]">
          Ingresa el código
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          Enviamos un código de 6 dígitos por SMS a tu celular (+51 {maskedPhone})
        </p>

        <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-border bg-white px-3.5 py-1">
          <input
            className="h-12 w-full bg-transparent font-mono text-[17px] text-center tracking-[0.25em] outline-none"
            placeholder="— — — — — —"
            inputMode="numeric"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            tabIndex={active ? 0 : -1}
            autoFocus
          />
        </div>

        <div className="mt-4 flex items-center justify-between text-[13px]">
          <button
            type="button"
            className="font-semibold text-brand underline"
            onClick={() => {
              setPhase('input')
              setCode('')
              setError(null)
            }}
            tabIndex={active ? 0 : -1}
          >
            Corregir número
          </button>

          {cooldown > 0 ? (
            <span style={{ color: 'rgba(26,22,20,0.5)' }}>Reenviar en {cooldown}s</span>
          ) : (
            <button
              type="button"
              className="font-semibold text-brand underline"
              onClick={() => handleSendCode()}
              tabIndex={active ? 0 : -1}
            >
              Reenviar código
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
      </div>

      <div className="border-t px-4 pt-3.5 pb-6" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block"
          disabled={!isCodeValid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Verificando…' : 'Confirmar código'}
        </button>
      </div>
    </form>
  )
}
