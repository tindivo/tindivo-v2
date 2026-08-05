'use client'

import { useEffect, useState } from 'react'
import { DriverShell } from '@/components/driver-shell'
import { Login } from '@/components/login'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export default function DriverLayout({ children }: { children: React.ReactNode }) {
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
  return <DriverShell>{children}</DriverShell>
}
