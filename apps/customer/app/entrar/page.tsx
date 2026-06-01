'use client'

import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const TERMS_VERSION = '2026-05'

function EntrarForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/'

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (mode === 'signup' && !accepted) {
      setError('Debes aceptar los Términos y la Política de Privacidad')
      return
    }
    setLoading(true)
    const supabase = getSupabaseBrowser()
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (err) throw err
        if (!data.session) {
          setInfo('Te enviamos un correo de confirmación. Revísalo para activar tu cuenta.')
          setLoading(false)
          return
        }
        // Registrar aceptación de términos (RLS permite el propio user_id).
        await supabase
          .from('terms_acceptance')
          .insert({ user_id: data.user?.id ?? '', version: TERMS_VERSION })
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
      }
      router.replace(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar')
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
      <h1 className="mb-1 font-display font-semibold text-[28px] text-ink">
        {mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}
      </h1>
      <p className="mb-6 text-[15px] text-ink-muted">Para pedir en Tindivo necesitas una cuenta.</p>

      <Card>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'signup' && (
              <label className="block">
                <span className="font-mono text-[11px] text-ink-subtle uppercase tracking-wide">
                  Nombre
                </span>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </label>
            )}
            <label className="block">
              <span className="font-mono text-[11px] text-ink-subtle uppercase tracking-wide">
                Correo
              </span>
              <input
                type="email"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] text-ink-subtle uppercase tracking-wide">
                Contraseña
              </span>
              <input
                type="password"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'signup' && (
              <label className="flex items-start gap-2 text-[13px] text-ink-muted">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  Acepto los{' '}
                  <Link href="/terminos" target="_blank" className="text-brand underline">
                    Términos
                  </Link>{' '}
                  y la{' '}
                  <Link href="/privacidad" target="_blank" className="text-brand underline">
                    Política de Privacidad
                  </Link>
                  .
                </span>
              </label>
            )}

            {error && <p className="text-danger text-sm">{error}</p>}
            {info && <p className="text-info text-sm">{info}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <button
        type="button"
        className="mt-4 text-center text-[14px] text-ink-muted"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setError(null)
          setInfo(null)
        }}
      >
        {mode === 'login' ? (
          <>
            ¿No tienes cuenta? <span className="text-brand">Regístrate</span>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta? <span className="text-brand">Inicia sesión</span>
          </>
        )}
      </button>
    </main>
  )
}

export default function EntrarPage() {
  return (
    <Suspense>
      <EntrarForm />
    </Suspense>
  )
}
