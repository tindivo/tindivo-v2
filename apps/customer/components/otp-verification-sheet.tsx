'use client'

import { useEffect, useState, useRef } from 'react'
import { BottomSheet } from '@/components/ui'
import { api } from '@/lib/api'
import { ApiError } from '@tindivo/api-client'

type Props = {
  open: boolean
  phone: string
  onVerified: () => void
  onClose: () => void
}

export function OtpVerificationSheet({ open, phone, onVerified, onClose }: Props) {
  const [phase, setPhase] = useState<'sending' | 'verify'>('sending')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null)

  const isCodeValid = code.length === 6

  // Limpiar timers al desmontar
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    }
  }, [])

  // Auto-enviar código al abrir
  useEffect(() => {
    if (open && phone) {
      setPhase('sending')
      setCode('')
      setError(null)
      sendCode()
    }
  }, [open, phone])

  // Auto-submit OTP cuando llega a 6 dígitos
  useEffect(() => {
    if (phase === 'verify' && code.length === 6 && !busy) {
      verifyCode()
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

  async function sendCode() {
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
        setError(err instanceof Error ? err.message : 'Error al enviar código')
      }
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode() {
    if (!isCodeValid || busy) return
    setBusy(true)
    setError(null)

    try {
      await api.post<{ verified: boolean; phone: string }>('/customer/phone/verify', {
        phone,
        code,
      })
      onVerified()
    } catch (err) {
      if (err instanceof ApiError) {
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

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col" style={{ height: 'min(450px, 60dvh)' }}>
        {phase === 'sending' ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
            <p className="mt-4 text-[15px] font-semibold">Enviando código de verificación…</p>
            <p className="mt-1 text-[13px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
              Espera un momento, por favor.
            </p>
            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
            {error && (
              <button
                type="button"
                className="t-btn t-btn-secondary mt-4"
                onClick={sendCode}
              >
                Reintentar envío
              </button>
            )}
          </div>
        ) : (
          <div className="t-scroll flex-1 px-5 pt-4 pb-4">
            <h2 className="t-display text-[24px] leading-[1.15]">
              Verifica tu celular
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
                autoFocus
              />
            </div>

            <div className="mt-4 flex items-center justify-between text-[13px]">
              <button
                type="button"
                className="font-semibold text-brand underline"
                onClick={onClose}
              >
                Cancelar
              </button>

              {cooldown > 0 ? (
                <span style={{ color: 'rgba(26,22,20,0.5)' }}>Reenviar en {cooldown}s</span>
              ) : (
                <button
                  type="button"
                  className="font-semibold text-brand underline"
                  onClick={sendCode}
                >
                  Reenviar código
                </button>
              )}
            </div>

            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}

            <div className="mt-auto pt-6">
              <button
                type="button"
                className="t-btn t-btn-primary t-btn-block"
                disabled={!isCodeValid || busy}
                onClick={() => verifyCode()}
              >
                {busy ? 'Verificando…' : 'Confirmar código'}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
