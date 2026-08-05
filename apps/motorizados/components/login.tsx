'use client'

import { Button, Card } from '@tindivo/ui'
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
      <Card className="flex h-12 w-12 items-center justify-center rounded-2xl border-none bg-brand shadow-glow-brand">
        <span className="font-display text-[22px] font-bold text-white">T</span>
      </Card>

      <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
        Tindivo · Motorizados
      </p>
      <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight">Hola de nuevo</h1>
      <p className="mt-1 text-[14px] text-ink/55">Entra con la cuenta que te dio Tindivo.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block font-mono text-xs font-semibold uppercase tracking-wide text-ink/55">
            Correo
          </span>
          <input
            type="email"
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-base font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/8"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block font-mono text-xs font-semibold uppercase tracking-wide text-ink/55">
            Contraseña
          </span>
          <input
            type="password"
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-base font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/8"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  )
}
