'use client'

import { type FormEvent, useState } from 'react'
import { Field } from '@/components/admin'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** Pantalla de acceso. Al autenticar, AuthGate detecta el cambio de sesión y monta el shell. */
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <p className="t-eyebrow">Tindivo · Sala de control</p>
          <h1 className="t-display text-[30px] text-ink">Admin</h1>
          <p className="mt-1 text-[14px] text-ink-muted">Entra con tu cuenta de fundador.</p>
        </div>
        <div className="t-card">
          <form onSubmit={submit} className="space-y-3 p-1">
            <Field label="Correo">
              <input
                type="email"
                className="t-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Contraseña">
              <input
                type="password"
                className="t-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <button type="submit" className="t-btn t-btn-primary t-btn-block" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
