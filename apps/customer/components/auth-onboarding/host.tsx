'use client'

import { useEffect } from 'react'
import { clearOnboardingResume, readOnboardingResume, useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { AuthOnboardingSheet } from './auth-onboarding-sheet'
import { getProfileStatus } from './persistence'

/**
 * Si hay un resume pendiente (post-redirect de Google) y la sesión existe,
 * reabre el sheet en el paso que falte. Devuelve true si lo abrió.
 */
export async function resumeOnboardingIfPending(): Promise<boolean> {
  const resume = readOnboardingResume()
  if (!resume) return false
  // getUser() valida contra el servidor: una sesión obsoleta de un usuario borrado
  // no debe reabrir el onboarding (escribiría con un user_id inexistente → FK).
  const supabase = getSupabaseBrowser()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) {
    await supabase.auth.signOut().catch(() => {})
    return false
  }

  const status = await getProfileStatus(user.id)
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined
  const fullName = status.fullName ?? meta?.full_name ?? meta?.name ?? null
  const common = {
    path: 'google' as const,
    variant: 'google-resume' as const,
    next: resume.next,
    fullName,
    email: user.email ?? null,
  }

  if (!status.hasProfile) {
    useOnboarding.getState().openSheet({ ...common, step: 'google-name' })
  } else if (!status.hasPhone) {
    useOnboarding.getState().openSheet({ ...common, step: 'phone' })
  } else if (!status.hasAddress) {
    useOnboarding.getState().openSheet({ ...common, step: 'address' })
  } else {
    clearOnboardingResume()
    return false
  }
  return true
}

/**
 * Isla cliente montada en el layout: renderiza el sheet global y, en cargas
 * completas de página, reanuda el onboarding tras el redirect de Google.
 * (La navegación client-side desde /auth/callback llama resumeOnboardingIfPending
 * directamente porque el layout no se re-monta.)
 */
export function AuthOnboardingHost() {
  useEffect(() => {
    void resumeOnboardingIfPending()
  }, [])

  return <AuthOnboardingSheet />
}
