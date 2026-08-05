'use client'

import { BottomSheet } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { AddressStep } from '../auth-onboarding/steps/address-step'

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
        <p className="text-[13px] text-ink/50">¿Dónde te lo llevamos?</p>
      </div>
      <div className="h-[min(560px,78dvh)]">
        <AddressStep active mode="gate" userId={userId} onBack={onClose} onDone={onComplete} />
      </div>
    </BottomSheet>
  )
}
