'use client'

import { useEffect, useState } from 'react'
import { Home } from '@/components/home/home'
import { Login } from '@/components/login'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export default function MotorizadoPage() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        setAuthed(!!data.session)
        setReady(true)
      })
  }, [])

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />
  return <Home onSignOut={() => setAuthed(false)} />
}
