'use client'

import { LoadingState } from '@tindivo/ui'
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
    return (
      <LoadingState
        variant="fullscreen"
        label="Verificando acceso…"
        description="Tindivo Administrador"
        icon="shield_lock"
      />
    )
  if (!authed) return <Login />
  return <>{children}</>
}
