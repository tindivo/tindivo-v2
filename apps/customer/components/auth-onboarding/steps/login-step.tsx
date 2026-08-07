'use client'

import { Button } from '@tindivo/ui'
import { type FormEvent, useEffect, useState } from 'react'
import { signInWithEmail } from '../persistence'

/** Inicio de sesión con correo y contraseña (panel real; en el demo era stub). */
export function LoginStep({
  active,
  initialEmail,
  onDone,
  onSignup,
}: {
  active: boolean
  initialEmail?: string | null
  onDone: () => void
  onSignup: () => void
}) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Precarga el correo cuando se llega aquí desde "correo duplicado" en el registro.
  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
  }, [initialEmail])

  const valid = email.trim().length > 3 && password.length >= 6

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await signInWithEmail({ email: email.trim(), password })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4 scrollbar-hide">
        <h2 className="font-display text-[24px] font-bold leading-[1.1] tracking-tight text-ink">
          Hola de nuevo
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-muted">Entra con tu correo y contraseña.</p>

        <label className="mt-5 block">
          <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Correo <span className="text-brand">*</span>
          </span>
          <input
            type="email"
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            tabIndex={active ? 0 : -1}
          />
        </label>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        <button
          type="button"
          onClick={onSignup}
          className="mt-5 w-full text-center text-[14px] text-ink-muted"
          tabIndex={active ? 0 : -1}
        >
          ¿No tienes cuenta? <span className="font-semibold text-brand">Crear cuenta</span>
        </button>
      </div>

      <div className="border-t border-ink/[0.04] px-4 pt-3.5 pb-6">
        <Button
          type="submit"
          className="w-full"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Un momento…' : 'Entrar'}
        </Button>
      </div>
    </form>
  )
}
