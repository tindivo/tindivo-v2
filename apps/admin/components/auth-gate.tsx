'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { Login } from './login'

/** Puerta de autenticación: muestra Login o el shell según la sesión (reactivo a signIn/signOut). */
export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const sb = getSupabaseBrowser()
    sb.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setReady(true)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready)
    return <div className="grid min-h-dvh place-items-center text-ink-muted">Cargando…</div>
  if (!authed) return <Login />
  return <>{children}</>
}
