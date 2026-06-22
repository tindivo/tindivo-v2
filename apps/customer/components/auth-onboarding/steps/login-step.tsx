'use client'

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
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <h2 className="t-display text-[24px] leading-[1.1]">Hola de nuevo</h2>
        <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          Entra con tu correo y contraseña.
        </p>

        <label className="mt-5 block">
          <span className="t-field-label">
            Correo <span style={{ color: '#F97316' }}>*</span>
          </span>
          <input
            type="email"
            className="t-field"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            tabIndex={active ? 0 : -1}
          />
        </label>

        <label className="mt-3.5 block">
          <span className="t-field-label">
            Contraseña <span style={{ color: '#F97316' }}>*</span>
          </span>
          <input
            type="password"
            className="t-field"
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
          className="mt-5 w-full text-center text-[14px]"
          style={{ color: 'rgba(26,22,20,0.6)' }}
          tabIndex={active ? 0 : -1}
        >
          ¿No tienes cuenta? <span className="font-semibold text-brand">Crear cuenta</span>
        </button>
      </div>

      <div className="border-t px-4 pt-3.5 pb-6" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Un momento…' : 'Entrar'}
        </button>
      </div>
    </form>
  )
}
