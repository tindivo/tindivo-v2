'use client'

import { BottomSheet } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { GoogleNameStep } from '../auth-onboarding/steps/google-name-step'
import { PhoneStep } from '../auth-onboarding/steps/phone-step'

type Props = {
  onComplete: () => void
  onClose: () => void
}

export function PhoneGateModal({ onComplete, onClose }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{
    fullName: string | null
    email: string | null
    hasProfile: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      if (!u) {
        setError('No pudimos consultar tu sesión. Cierra esta ventana e intenta de nuevo.')
        return
      }
      setUserId(u.id)
      const emailStr = u.email ?? null
      const metaName = u.user_metadata?.full_name ?? u.user_metadata?.name ?? null
      // El nombre de Auth no prueba que exista la fila que /verify va a sellar.
      const { data: p, error: readError } = await supabase
        .from('customer_profiles')
        .select('full_name')
        .eq('user_id', u.id)
        .maybeSingle()
      if (readError) {
        setError('No pudimos consultar tu perfil. Cierra esta ventana e intenta de nuevo.')
        return
      }
      setProfile({ fullName: p?.full_name ?? metaName, email: emailStr, hasProfile: p !== null })
    })
  }, [])

  return (
    <BottomSheet open label="Verifica tu celular" onClose={onClose}>
      {/*
       * AQUÍ HABÍA UN RÓTULO —«Para hacer tu pedido, necesitamos verificar tu
       * celular»— y se ha quitado porque costaba más de lo que decía.
       *
       * Repetía lo que `PhoneStep` ya pinta en su `<h2>` dos líneas más abajo,
       * y a cambio se llevaba ~45 px de una hoja cuyo alto está tasado
       * (`max-h-[85dvh]`). Con el teclado abierto esos 45 px salen del único
       * sitio del que pueden salir: la zona de contenido, que es donde vive el
       * campo. Ver la nota larga en `steps/phone-step.tsx`.
       */}
      <div className="h-[min(500px,70dvh)]">
        {error ? (
          <p className="px-5 text-[13px] text-danger">{error}</p>
        ) : profile && !profile.hasProfile ? (
          <GoogleNameStep
            active
            initialName={profile.fullName}
            userId={userId}
            onDone={(fullName) => setProfile({ ...profile, fullName, hasProfile: true })}
          />
        ) : profile ? (
          <PhoneStep
            active
            mode="gate"
            fullName={profile.fullName}
            email={profile.email}
            userId={userId}
            onDone={onComplete}
          />
        ) : (
          <p role="status" className="px-5 text-[13px] text-ink-muted">
            Cargando tu perfil…
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
