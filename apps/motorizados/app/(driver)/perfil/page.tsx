'use client'

import { signOutLocal } from '@tindivo/supabase'
import { Button, Card, Icon, Skeleton } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ToggleSwitch } from '@/components/toggle-switch'
import { useAvailability } from '@/hooks/use-availability'
import type { SubscribeFailReason } from '@/hooks/use-push-subscription'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { signOutEverywhereDevice } from '@/lib/sign-out'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Techo de espera para la baja del push al cerrar sesión. Generoso para una
 * llamada que normalmente tarda decenas de ms, y corto comparado con lo que
 * aguanta alguien que acaba de pulsar «cerrar sesión».
 */
const PUSH_CLEANUP_TIMEOUT_MS = 3_000

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
  const [loggingOutEverywhere, setLoggingOutEverywhere] = useState(false)
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

  /**
   * El orden es obligatorio: PRIMERO la baja del push, DESPUÉS la sesión.
   *
   * `DELETE /push/subscriptions` va autenticado, así que después de cerrar
   * sesión ya no hay JWT con el que llamarlo y la fila se quedaría viva: el
   * teléfono seguiría sonando con pedidos que este motorizado ya no puede
   * abrir, hasta que el navegador rotara el endpoint.
   *
   * Un fallo de la baja NO bloquea el logout — quien pulsa «cerrar sesión»
   * tiene que salir aunque no haya red. La fila huérfana que quede se recicla
   * sola: el siguiente que entre en este dispositivo reclama el endpoint en el
   * POST (`cleanup-foreign`), y si nadie entra el proveedor acaba dando 410.
   */
  async function handleLogout() {
    if (!confirm('¿Cerrar sesión?')) return
    try {
      // La carrera contra el reloj NO es paranoia: `unsubscribe()` espera a
      // `navigator.serviceWorker.ready`, que no resuelve NUNCA —no rechaza— si
      // el service worker no llegó a registrarse (404 de `/sw.js`, modo
      // privado, un navegador sin soporte). Sin este límite, ese caso deja al
      // motorizado pulsando «cerrar sesión» sin que pase nada.
      await Promise.race([
        push.unsubscribe(),
        new Promise((resolve) => setTimeout(resolve, PUSH_CLEANUP_TIMEOUT_MS)),
      ])
    } catch (err) {
      console.error('[perfil] no se pudo dar de baja el push al salir', err)
    }
    await signOutLocal(getSupabaseBrowser())
    router.replace('/')
  }

  /**
   * Salida de emergencia: para cuando se pierde el teléfono.
   *
   * Va detrás de un `confirm` que dice exactamente lo que hace, porque echa al
   * motorizado de equipos que no tiene delante — incluido, si se equivoca, el
   * que está usando en mitad de un turno.
   */
  async function handleLogoutEverywhere() {
    const ok = confirm(
      '¿Cerrar sesión en TODOS los dispositivos?\n\n' +
        'Saldrás también de cualquier otro teléfono donde tengas esta cuenta abierta, ' +
        'y esos equipos dejarán de recibir avisos.\n\n' +
        'Úsalo si perdiste un teléfono.',
    )
    if (!ok) return
    setLoggingOutEverywhere(true)
    try {
      await signOutEverywhereDevice()
      router.replace('/')
    } catch (err) {
      console.error('[perfil] no se pudo cerrar sesión en todos los dispositivos', err)
      setLoggingOutEverywhere(false)
      alert('No se pudo completar. Revisa tu conexión e intenta de nuevo.')
    }
  }

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <h1 className="font-display text-[24px] font-bold tracking-tight">Mi perfil</h1>
      </div>

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
            <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              Tus datos
            </p>
            <dl className="space-y-4">
              <Row icon="person" label="Nombre" value={profile.fullName} />
              <Row icon="mail" label="Email" value={profile.email} />
              {profile.phone && (
                <Row icon="phone" label="Teléfono" value={`+51 ${profile.phone}`} />
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              Preferencias
            </p>
            <div className="space-y-5">
              <div>
                <div
                  className={
                    availability.loading || availability.busy || availability.blocked
                      ? 'opacity-60'
                      : ''
                  }
                >
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
                </div>
                {/* Único sitio donde se enseña: el hook ya decide que los
                      fallos de lectura no molestan al motorizado. */}
                {availability.error && (
                  <p className="mt-2 text-[13px] text-danger">{availability.error}</p>
                )}
              </div>

              <div className="h-px bg-ink/[0.06]" />

              <div>
                <div
                  className={
                    push.loading || push.status === 'unsupported' || push.status === 'denied'
                      ? 'opacity-60'
                      : ''
                  }
                >
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
                </div>
                {pushError && <p className="mt-2 text-[13px] text-danger">{pushError}</p>}
              </div>
            </div>
          </Card>

          <Button variant="secondary" size="lg" className="w-full" onClick={handleLogout}>
            <Icon name="logout" />
            Cerrar sesión
          </Button>

          {/* Deliberadamente discreto y debajo: es la salida de emergencia, no
              la de todos los días. Quien la busca sabe lo que busca. */}
          <button
            type="button"
            onClick={handleLogoutEverywhere}
            disabled={loggingOutEverywhere}
            className="w-full py-2 text-center text-[13px] text-ink-muted underline underline-offset-4 disabled:opacity-50"
          >
            {loggingOutEverywhere
              ? 'Cerrando en todos…'
              : 'Perdí mi teléfono · cerrar sesión en todos los dispositivos'}
          </button>
        </div>
      )}
    </main>
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
        <dd className="truncate text-[15px] font-semibold text-ink">{value}</dd>
      </div>
    </div>
  )
}
