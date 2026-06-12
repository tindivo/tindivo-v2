'use client'

import { type FormEvent, useState } from 'react'
import { signUpWithEmail } from '../persistence'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Registro con correo: tres campos y listo (sin verificación). */
export function EmailSignupStep({
  active,
  onDone,
}: {
  active: boolean
  onDone: (identity: { fullName: string; email: string }) => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = fullName.trim().length >= 2 && EMAIL_RE.test(email.trim()) && password.length >= 6

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await signUpWithEmail({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      })
      onDone({ fullName: fullName.trim(), email: email.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <h2 className="t-display text-[24px] leading-[1.1]">Crea tu cuenta</h2>
        <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          Sin verificación. Tres campos y listo.
        </p>

        <label className="mt-5 block">
          <span className="t-field-label">
            Nombre completo <span style={{ color: '#F97316' }}>*</span>
          </span>
          <input
            className="t-field"
            placeholder="Ej. María López"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            maxLength={120}
            tabIndex={active ? 0 : -1}
          />
        </label>

        <label className="mt-3.5 block">
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
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            tabIndex={active ? 0 : -1}
          />
        </label>
        <p className="mt-1.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
          Mínimo 6 caracteres.
        </p>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>

      <div className="border-t px-4 pt-3.5 pb-6" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </div>
    </form>
  )
}
