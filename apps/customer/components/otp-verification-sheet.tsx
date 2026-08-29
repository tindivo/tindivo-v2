'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomSheet, Button } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

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
        if (err.status === 409) {
          setError('Este número ya está registrado en otra cuenta.')
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

  const maskedPhone = phone.length === 9 ? `${phone.slice(0, 3)} *** ${phone.slice(-3)}` : phone

  return (
    <BottomSheet open={open} label="Verificación por código" onClose={onClose}>
      <div className="flex h-[min(450px,60dvh)] flex-col">
        {phase === 'sending' ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
            <p className="mt-4 text-[15px] font-semibold">Enviando código de verificación…</p>
            <p className="mt-1 text-[13px] text-ink/50">Espera un momento, por favor.</p>
            {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
            {error && (
              <Button type="button" variant="secondary" className="mt-4 w-full" onClick={sendCode}>
                Reintentar envío
              </Button>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4 scrollbar-hide">
            <h2 className="font-display text-[24px] font-bold leading-[1.15] tracking-tight">
              Verifica tu celular
            </h2>
            <p className="mt-1.5 text-[14px] text-ink/60">
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
                // biome-ignore lint/a11y/noAutofocus: OTP input inside active verification sheet
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
                <span className="text-ink/50">Reenviar en {cooldown}s</span>
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
              <Button
                type="button"
                variant="brand"
                className="w-full"
                disabled={!isCodeValid || busy}
                onClick={() => verifyCode()}
              >
                {busy ? 'Verificando…' : 'Confirmar código'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
