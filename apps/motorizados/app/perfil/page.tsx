'use client'

import { Button, Card, Icon, Skeleton } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DriverShell } from '@/components/driver-shell'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface DriverProfile {
  fullName: string
  email: string
  phone: string | null
}

export default function PerfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<DriverProfile | null>(null)
  const [loading, setLoading] = useState(true)

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
