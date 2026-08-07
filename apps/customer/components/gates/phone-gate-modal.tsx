'use client'

import { BottomSheet } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { PhoneStep } from '../auth-onboarding/steps/phone-step'

type Props = {
  onComplete: () => void
  onClose: () => void
}

export function PhoneGateModal({ onComplete, onClose }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ fullName: string | null; email: string | null } | null>(
    null,
  )

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setUserId(u.id)
      const emailStr = u.email ?? null
      const metaName = u.user_metadata?.full_name ?? u.user_metadata?.name ?? null
      if (metaName) {
        setProfile({ fullName: metaName, email: emailStr })
      } else {
        supabase
          .from('customer_profiles')
          .select('full_name')
          .eq('user_id', u.id)
          .maybeSingle()
          .then(({ data: p }) => {
            setProfile({ fullName: p?.full_name ?? emailStr ?? 'usuario', email: emailStr })
          })
      }
    })
  }, [])

  return (
    <BottomSheet open onClose={onClose}>
      <div className="px-5 pt-4 pb-1">
        <p className="text-[13px] text-ink/50">
          Para hacer tu pedido, necesitamos verificar tu celular
        </p>
      </div>
      <div className="h-[min(500px,70dvh)]">
        <PhoneStep
          active
          mode="gate"
          fullName={profile?.fullName ?? null}
          email={profile?.email ?? null}
          userId={userId}
          onDone={onComplete}
        />
      </div>
    </BottomSheet>
  )
}
