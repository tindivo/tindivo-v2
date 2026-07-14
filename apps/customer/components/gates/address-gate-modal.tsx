'use client'

import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/ui'
import { AddressStep } from '../auth-onboarding/steps/address-step'
import { getSupabaseBrowser } from '@/lib/supabase/client'

type Props = {
  onComplete: () => void
  onClose: () => void
}

export function AddressGateModal({ onComplete, onClose }: Props) {
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
          ¿Dónde te lo llevamos?
        </p>
      </div>
      <div style={{ height: 'min(560px, 78dvh)' }}>
        <AddressStep
          active
          mode="gate"
          userId={userId}
          onBack={onClose}
          onDone={onComplete}
        />
      </div>
    </BottomSheet>
  )
}
