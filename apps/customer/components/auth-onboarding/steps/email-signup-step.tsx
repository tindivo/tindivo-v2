'use client'

import { Button } from '@tindivo/ui'
import { type FormEvent, useState } from 'react'
import { signUpWithEmail } from '../persistence'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Registro con correo: tres campos y listo (sin verificación). */
export function EmailSignupStep({
  active,
  onDone,
  onGoToLogin,
}: {
  active: boolean
  onDone: (identity: { fullName: string; email: string }) => void
  onGoToLogin: (email: string) => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El correo ya existe: ofrecemos saltar a "Iniciar sesión" con el correo precargado.
  const [duplicate, setDuplicate] = useState(false)

  const valid = fullName.trim().length >= 2 && EMAIL_RE.test(email.trim()) && password.length >= 6

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    setDuplicate(false)
    try {
      await signUpWithEmail({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      })
      onDone({ fullName: fullName.trim(), email: email.trim() })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la cuenta'
      setError(msg)
      setDuplicate(msg.includes('ya tiene una cuenta'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4 scrollbar-hide">
        <h2 className="font-display text-[24px] font-bold leading-[1.1] tracking-tight text-ink">
          Crea tu cuenta
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-muted">Sin verificación. Tres campos y listo.</p>

        <label className="mt-5 block">
          <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Nombre completo <span className="text-brand">*</span>
          </span>
          <input
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            placeholder="Ej. María López"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            maxLength={120}
            tabIndex={active ? 0 : -1}
          />
        </label>

        <label className="mt-3.5 block">
          <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Correo <span className="text-brand">*</span>
          </span>
          <input
            type="email"
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (duplicate) setDuplicate(false)
            }}
            autoComplete="email"
            inputMode="email"
            tabIndex={active ? 0 : -1}
          />
        </label>

        <label className="mt-3.5 block">
          <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Contraseña <span className="text-brand">*</span>
          </span>
          <input
            type="password"
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            tabIndex={active ? 0 : -1}
          />
        </label>
        <p className="mt-1.5 text-[12px] text-ink-muted">Mínimo 6 caracteres.</p>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        {duplicate && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onGoToLogin(email.trim())}
            className="mt-3 w-full bg-brand-soft text-brand-dark hover:bg-brand-soft/80"
            tabIndex={active ? 0 : -1}
          >
            Iniciar sesión con este correo
          </Button>
        )}
      </div>

      <div className="border-t border-ink/[0.04] px-4 pt-3.5 pb-6">
        <Button
          type="submit"
          className="w-full"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </div>
    </form>
  )
}
