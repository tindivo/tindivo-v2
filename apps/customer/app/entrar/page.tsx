'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'
import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Fallback de deep links (/entrar?next=…): el auth real vive en el bottom-sheet
 * de onboarding (components/auth-onboarding). Esta página solo lo abre.
 */
function EntrarContent() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/'
  const sheetOpen = useOnboarding((s) => s.open)
  const openedRef = useRef(false)

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          router.replace(next)
        } else if (!openedRef.current) {
          openedRef.current = true
          useOnboarding.getState().openSheet({ next, inPlace: false })
        }
      })
  }, [next, router])

  // Cerró el sheet sin iniciar sesión → volver al inicio.
  useEffect(() => {
    if (!openedRef.current || sheetOpen) return
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) router.replace('/')
      })
  }, [sheetOpen, router])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl font-bold text-[24px] text-white"
        style={{ background: '#F97316', boxShadow: '0 8px 20px -6px rgba(249,115,22,0.55)' }}
      >
        T
      </div>
      <p className="t-muted mt-4 text-[15px]">Para pedir en Tindivo necesitas una cuenta.</p>
    </main>
  )
}

export default function EntrarPage() {
  return (
    <Suspense>
      <EntrarContent />
    </Suspense>
  )
}
