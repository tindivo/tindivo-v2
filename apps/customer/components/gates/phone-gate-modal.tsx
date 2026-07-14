'use client'

import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/ui'
import { PhoneStep } from '../auth-onboarding/steps/phone-step'
import { getSupabaseBrowser } from '@/lib/supabase/client'

type Props = {
  onComplete: () => void
  onClose: () => void
}

export function PhoneGateModal({ onComplete, onClose }: Props) {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        setUserId(data.user?.id ?? null)
      })
  }, [])

  return (
    <BottomSheet open onClose={onClose}>
      <div className="px-5 pt-4 pb-1">
        <p className="text-[13px]" style={{ color: 'rgba(26,22,20,0.5)' }}>
          Para hacer tu pedido, necesitamos verificar tu celular
        </p>
      </div>
      <div style={{ height: 'min(500px, 70dvh)' }}>
        <PhoneStep
          active
          mode="gate"
          fullName={null}
          email={null}
          userId={userId}
          onDone={onComplete}
        />
      </div>
    </BottomSheet>
  )
}
