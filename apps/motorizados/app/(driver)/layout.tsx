'use client'

import { LoadingState } from '@tindivo/ui'
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

  if (!ready)
    return (
      <LoadingState
        variant="fullscreen"
        label="Cargando perfil…"
        description="Tindivo Repartidores"
        icon="two_wheeler"
      />
    )
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />
  return <DriverShell>{children}</DriverShell>
}
