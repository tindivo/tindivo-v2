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
    const sb = getSupabaseBrowser()
    // `ready` se pone en true pase lo que pase: si el refresh token guardado ya
    // no vale, `getSession()` REVIENTA en vez de resolver con sesión nula, y con
    // `.then()` a secas la pantalla se quedaba en "Cargando perfil…" para
    // siempre. Un fallo al recuperar la sesión ES no tener sesión.
    // (Mismo defecto que tenían `apps/admin` y `apps/negocios`.)
    sb.auth
      .getSession()
      .then(({ data }) => setAuthed(!!data.session))
      .catch(() => setAuthed(false))
      .finally(() => setReady(true))
    // Sin esta suscripción el turno se queda colgado cuando la sesión muere por
    // fuera —token revocado, contraseña cambiada, refresh caducado—: la shell
    // seguía montada enseñando pedidos viejos mientras cada petición caía en
    // 401, y el motorizado no tenía forma de saber que ya no estaba dentro
    // hasta recargar a mano. Es lo que hacen admin y negocios desde siempre.
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session))
    return () => sub.subscription.unsubscribe()
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
