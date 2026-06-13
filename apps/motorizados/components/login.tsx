'use client'

import { type FormEvent, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** Login del motorizado (cuentas creadas por administración, sin autoregistro). */
export function Login({ onAuthed }: { onAuthed: () => void }) {
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
    } else onAuthed()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-6">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl font-bold text-[22px] text-white"
        style={{ background: '#F97316', boxShadow: '0 8px 20px -6px rgba(249,115,22,0.55)' }}
      >
        T
      </div>
      <p className="t-eyebrow mt-5" style={{ marginBottom: 0 }}>
        Tindivo · Motorizados
      </p>
      <h1 className="t-display mt-1 text-[28px]">Hola de nuevo</h1>
      <p className="t-muted mt-1 text-[14px]">Entra con la cuenta que te dio Tindivo.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="t-field-label">Correo</span>
          <input
            type="email"
            className="t-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="block">
          <span className="t-field-label">Contraseña</span>
          <input
            type="password"
            className="t-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <button type="submit" className="t-btn t-btn-primary t-btn-block" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
