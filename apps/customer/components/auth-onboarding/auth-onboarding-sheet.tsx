'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  clearOnboardingResume,
  type OnboardingStep,
  saveOnboardingResume,
  useOnboarding,
} from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { signInWithGoogle } from './persistence'
import { AddressStep } from './steps/address-step'
import { EmailSignupStep } from './steps/email-signup-step'
import { GoogleNameStep } from './steps/google-name-step'
import { LoginStep } from './steps/login-step'
import { MethodStep } from './steps/method-step'
import { PhoneStep } from './steps/phone-step'

// Orden fijo del carrusel (todos los paneles montados, como el demo).
const PANEL_ORDER: OnboardingStep[] = [
  'method',
  'email-signup',
  'login',
  'google-name',
  'phone',
  'address',
]

// Pasos posteriores a la creación de cuenta: el X significa "completar después".
const SKIPPABLE: OnboardingStep[] = ['google-name', 'address']

/**
 * Bottom-sheet de onboarding multi-paso (réplica de tindivo-demo.vercel.app).
 * Camino correo: method → email-signup → phone → address.
 * Camino Google: redirect OAuth → (resume) google-name → phone → address.
 */
export function AuthOnboardingSheet() {
  const router = useRouter()
  const ob = useOnboarding()
  const [userId, setUserId] = useState<string | null>(null)

  // Mantener el userId al día mientras el sheet está abierto (signup/login lo crean).
  useEffect(() => {
    if (!ob.open) return
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [ob.open])

  if (!ob.open) return null

  const idx = Math.max(0, PANEL_ORDER.indexOf(ob.step))
  const totalSteps = ob.path === 'google' ? 3 : 2
  const stepNumber: Partial<Record<OnboardingStep, number>> = {
    'google-name': 1,
    phone: ob.path === 'google' ? 2 : 1,
    address: ob.path === 'google' ? 3 : 2,
  }

  /** Cierra y continúa a `next` (cuenta ya creada o login hecho). */
  function finish() {
    clearOnboardingResume()
    const { next, inPlace, closeSheet } = useOnboarding.getState()
    closeSheet()
    if (next && !inPlace) router.push(next)
  }

  /** Cierra sin sesión (el caller — checkout o /entrar — decide la navegación). */
  function abandon() {
    useOnboarding.getState().closeSheet()
  }

  function onHeaderLeading() {
    if (ob.step === 'email-signup' || ob.step === 'login') {
      ob.goTo('method')
    } else if (SKIPPABLE.includes(ob.step)) {
      finish()
    } else {
      abandon()
    }
  }

  const isBack = ob.step === 'email-signup' || ob.step === 'login'
  const skippable = SKIPPABLE.includes(ob.step)
  const headerLabel =
    ob.step === 'method'
      ? 'Crear cuenta'
      : ob.step === 'email-signup'
        ? 'Con correo'
        : ob.step === 'login'
          ? 'Iniciar sesión'
          : null
  const chip = stepNumber[ob.step]

  const canDismiss = SKIPPABLE.includes(ob.step)

  // Se reaprovecha el rótulo que el paso ya tiene en vez de escribir otro mapa.
  // Los tres pasos donde es `null` (nombre, celular, dirección) son justo los de
  // completar el perfil, así que ese es su nombre.
  const titulo = headerLabel ?? 'Completa tu perfil'

  return (
    <BottomSheet open label={titulo} onClose={canDismiss ? (userId ? finish : abandon) : undefined}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onHeaderLeading}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] transition-colors hover:bg-ink/[0.10]"
            aria-label={isBack ? 'Atrás' : 'Cerrar'}
          >
            {isBack ? <Icon name="arrow_back" size={20} /> : <Icon name="close" size={20} />}
          </button>
          {skippable && (
            <span className="text-[12px] text-ink-muted">Puedes completar esto después</span>
          )}
        </div>
        {chip ? (
          <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-[11px] text-brand-dark">
            Paso {chip} de {totalSteps}
          </span>
        ) : headerLabel ? (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {headerLabel}
          </span>
        ) : null}
      </div>

      {/* Carrusel horizontal: todos los pasos montados, translate al activo. */}
      <div className="h-[min(560px,78dvh)] overflow-hidden">
        <div
          className="flex h-full"
          style={{
            width: `${PANEL_ORDER.length * 100}%`,
            transform: `translateX(-${(idx * 100) / PANEL_ORDER.length}%)`,
            transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {PANEL_ORDER.map((panel) => {
            const active = panel === ob.step
            return (
              <div
                key={panel}
                className="h-full"
                style={{ width: `${100 / PANEL_ORDER.length}%` }}
                aria-hidden={!active}
                inert={!active}
              >
                {panel === 'method' && (
                  <MethodStep
                    onGoogle={async () => {
                      saveOnboardingResume(useOnboarding.getState().next)
                      await signInWithGoogle()
                    }}
                    onEmail={() => ob.goTo('email-signup')}
                    onLogin={() => ob.goTo('login')}
                  />
                )}
                {panel === 'email-signup' && (
                  <EmailSignupStep
                    active={active}
                    onDone={({ fullName, email }) => {
                      ob.setIdentity({ fullName, email })
                      ob.setPath('email')
                      ob.goTo('phone')
                    }}
                    onGoToLogin={(email) => {
                      ob.setIdentity({ email })
                      ob.goTo('login')
                    }}
                  />
                )}
                {panel === 'login' && (
                  <LoginStep
                    active={active}
                    initialEmail={ob.email}
                    onDone={finish}
                    onSignup={() => ob.goTo('method')}
                  />
                )}
                {panel === 'google-name' && (
                  <GoogleNameStep
                    active={active}
                    initialName={ob.fullName}
                    userId={userId}
                    onDone={(fullName) => {
                      ob.setIdentity({ fullName })
                      ob.goTo('phone')
                    }}
                  />
                )}
                {panel === 'phone' && (
                  <PhoneStep
                    active={active}
                    fullName={ob.fullName}
                    email={ob.email}
                    userId={userId}
                    onDone={() => ob.goTo('address')}
                  />
                )}
                {panel === 'address' && (
                  <AddressStep
                    active={active}
                    userId={userId}
                    onBack={() => ob.goTo('phone')}
                    onDone={finish}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
