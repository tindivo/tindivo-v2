'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { resumeOnboardingIfPending } from '@/components/auth-onboarding/host'
import { readOnboardingResume } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Aterrizaje del OAuth de Google. El cliente browser (PKCE, detectSessionInUrl)
 * intercambia el ?code= automáticamente; aquí solo esperamos la sesión, reanudamos
 * el onboarding si falta perfil/teléfono/dirección y navegamos al destino.
 */
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let done = false

    async function go() {
      if (done) return
      done = true
      const resume = readOnboardingResume()
      await resumeOnboardingIfPending()
      router.replace(resume?.next ?? '/')
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void go()
    })
    // El exchange pudo completarse antes de suscribirnos.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void go()
    })
    // Red de seguridad: si el exchange falla, no dejar al usuario atrapado aquí.
    const timeout = setTimeout(() => void go(), 8000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div
        className="h-10 w-10 animate-spin rounded-full"
        style={{ border: '3px solid rgba(249,115,22,0.2)', borderTopColor: '#F97316' }}
      />
      <p className="t-muted mt-4 text-[15px]">Un momento…</p>
    </main>
  )
}
