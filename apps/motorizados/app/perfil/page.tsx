'use client'

import { Button, Card, Icon, Skeleton } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DriverShell } from '@/components/driver-shell'
import { ToggleSwitch } from '@/components/toggle-switch'
import { useAvailability } from '@/hooks/use-availability'
import type { SubscribeFailReason } from '@/hooks/use-push-subscription'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface DriverProfile {
  fullName: string
  email: string
  phone: string | null
}

/**
 * Texto accionable por causa de fallo. El motorizado no puede hacer nada con
 * "error al suscribir": lo que necesita saber es si vuelve a intentarlo, si
 * tiene que reloguearse o si esto es cosa nuestra.
 */
function mapReason(reason: SubscribeFailReason): string {
  if (reason === 'no-vapid') return 'Configuración incompleta. Avisa al administrador.'
  if (reason === 'no-session') return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (reason === 'no-permission') return 'Permiso no concedido.'
  if (reason === 'incomplete-keys') return 'Este navegador no completó el registro.'
  if (reason.startsWith('subscribe-throw')) return 'No se pudo registrar el dispositivo.'
  if (reason.startsWith('api-error')) return 'No se pudo guardar. Revisa tu conexión.'
  return 'No se pudo activar. Intenta de nuevo.'
}

export default function PerfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [pushError, setPushError] = useState<string | null>(null)
  const availability = useAvailability()
  const push = usePushSubscription()

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser()
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) {
        setLoading(false)
        return
      }

      const { data: driver } = await supabase
        .from('drivers')
        .select('full_name, phone')
        .maybeSingle()

      setProfile({
        fullName: driver?.full_name ?? user.user_metadata?.full_name ?? 'Motorizado',
        email: user.email ?? '—',
        phone: driver?.phone ?? user.phone ?? null,
      })
      setLoading(false)
    }
    void load()
  }, [])

  /**
   * `requestPermission()` va PRIMERO y sin ningún await por delante: iOS Safari
   * rompe el contexto del gesto del usuario si algo asíncrono se cuela antes, y
   * entonces el diálogo del sistema no llega a aparecer. Por eso el hook no lo
   * pide por su cuenta — tiene que salir de aquí, del toque.
   */
  async function handleEnableNotifications() {
    setPushError(null)
    if (typeof Notification === 'undefined') return

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        await push.refresh()
        return
      }
    }

    const r = await push.subscribe()
    if (!r.ok) {
      // El motivo crudo va siempre a consola aunque se enseñe el texto amable:
      // sin él, un fallo en el teléfono de otra persona es indepurable.
      console.error('[perfil] no se pudo activar avisos', r.reason)
      setPushError(mapReason(r.reason))
    }
  }

  async function handleLogout() {
    if (!confirm('¿Cerrar sesión?')) return
    await getSupabaseBrowser().auth.signOut()
    router.replace('/')
  }

  return (
    <DriverShell>
      <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
        <h1 className="t-display mb-4 text-[24px]">Mi perfil</h1>

        {loading || !profile ? (
          <div className="space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="flex items-center gap-4 p-5">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
                <span className="font-display text-[24px] font-bold">
                  {profile.fullName.charAt(0).toUpperCase()}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-bold text-ink">{profile.fullName}</p>
                <p className="text-[13px] text-ink-muted">{profile.email}</p>
              </div>
            </Card>

            <Card className="p-5">
              <p className="t-eyebrow mb-4">Tus datos</p>
              <dl className="space-y-4">
                <Row icon="person" label="Nombre" value={profile.fullName} />
                <Row icon="mail" label="Email" value={profile.email} />
                {profile.phone && (
                  <Row icon="phone" label="Teléfono" value={`+51 ${profile.phone}`} />
                )}
              </dl>
            </Card>

            <Card className="p-5">
              <p className="t-eyebrow mb-4">Preferencias</p>
              <div className="space-y-5">
                <div>
                  <ToggleSwitch
                    checked={availability.available}
                    onChange={(next) => void availability.setAvailable(next)}
                    disabled={availability.loading || availability.busy || availability.blocked}
                    label="Disponible"
                    description={
                      availability.blocked
                        ? 'Fuera del horario de la plataforma'
                        : 'Recibir pedidos nuevos'
                    }
                    icon={<Icon name="toggle_on" size={22} />}
                  />
                  {/* Único sitio donde se enseña: el hook ya decide que los
                      fallos de lectura no molestan al motorizado. */}
                  {availability.error && (
                    <p className="mt-2 text-[13px] text-danger">{availability.error}</p>
                  )}
                </div>

                <div className="h-px bg-ink/[0.06]" />

                <div>
                  <ToggleSwitch
                    checked={push.status === 'subscribed'}
                    onChange={() => {
                      if (push.status === 'subscribed') {
                        void push.unsubscribe()
                        return
                      }
                      void handleEnableNotifications()
                    }}
                    // 'denied' se deja bloqueado a propósito: una vez negado el
                    // permiso, `requestPermission()` ya no vuelve a preguntar.
                    // Un switch que no hace nada al tocarlo es peor que uno
                    // visiblemente apagado.
                    disabled={
                      push.loading || push.status === 'unsupported' || push.status === 'denied'
                    }
                    label="Notificaciones"
                    description={
                      push.status === 'unsupported'
                        ? 'No disponible en este navegador'
                        : push.status === 'denied'
                          ? 'Bloqueado en los ajustes del navegador'
                          : 'Alertas de pedidos nuevos'
                    }
                    icon={<Icon name="notifications" size={22} />}
                  />
                  {pushError && <p className="mt-2 text-[13px] text-danger">{pushError}</p>}
                </div>
              </div>
            </Card>

            <Button variant="secondary" size="lg" className="w-full" onClick={handleLogout}>
              <Icon name="logout" />
              Cerrar sesión
            </Button>
          </div>
        )}
      </main>
    </DriverShell>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-low text-ink-muted">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</dt>
        <dd className="truncate font-semibold text-ink">{value}</dd>
      </div>
    </div>
  )
}
