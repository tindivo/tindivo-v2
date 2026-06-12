'use client'

import { create } from 'zustand'

/** Pasos del sheet de onboarding (carrusel horizontal, orden fijo). */
export type OnboardingStep =
  | 'method'
  | 'email-signup'
  | 'login'
  | 'google-name'
  | 'phone'
  | 'address'

export type OnboardingVariant = 'fresh' | 'google-resume' | 'profile-incomplete'

/** Numeración de pasos: email = 2 pasos post-cuenta; google = 3 (incluye nombre). */
export type OnboardingPath = 'email' | 'google'

const RESUME_KEY = 'tindivo.onboarding.resume'
const RESUME_TTL_MS = 30 * 60 * 1000

interface ResumePayload {
  v: 1
  next: string | null
  ts: number
}

/** Guarda el destino antes del redirect OAuth (la página se recarga al volver). */
export function saveOnboardingResume(next: string | null) {
  try {
    const payload: ResumePayload = { v: 1, next, ts: Date.now() }
    localStorage.setItem(RESUME_KEY, JSON.stringify(payload))
  } catch {
    // localStorage no disponible (modo privado estricto): el gate del checkout cubre el caso.
  }
}

/** Lee el resume si existe y no expiró (30 min). */
export function readOnboardingResume(): ResumePayload | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ResumePayload
    if (parsed.v !== 1 || Date.now() - parsed.ts > RESUME_TTL_MS) {
      localStorage.removeItem(RESUME_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearOnboardingResume() {
  try {
    localStorage.removeItem(RESUME_KEY)
  } catch {
    // noop
  }
}

interface OnboardingState {
  open: boolean
  variant: OnboardingVariant
  step: OnboardingStep
  path: OnboardingPath
  /** Ruta a la que continuar al terminar (null = quedarse donde está). */
  next: string | null
  /** true si lo abrió el checkout: al cerrar sin sesión NO se navega (el caller decide). */
  inPlace: boolean
  /** Datos cross-step para la card "¡Hola, {nombre}!". */
  fullName: string | null
  email: string | null

  openSheet: (opts?: {
    next?: string | null
    inPlace?: boolean
    step?: OnboardingStep
    variant?: OnboardingVariant
    path?: OnboardingPath
    fullName?: string | null
    email?: string | null
  }) => void
  closeSheet: () => void
  goTo: (step: OnboardingStep) => void
  setPath: (path: OnboardingPath) => void
  setIdentity: (identity: { fullName?: string | null; email?: string | null }) => void
}

export const useOnboarding = create<OnboardingState>((set) => ({
  open: false,
  variant: 'fresh',
  step: 'method',
  path: 'email',
  next: null,
  inPlace: false,
  fullName: null,
  email: null,

  openSheet: (opts) =>
    set({
      open: true,
      variant: opts?.variant ?? 'fresh',
      step: opts?.step ?? 'method',
      path: opts?.path ?? (opts?.step === 'google-name' ? 'google' : 'email'),
      next: opts?.next ?? null,
      inPlace: opts?.inPlace ?? false,
      fullName: opts?.fullName ?? null,
      email: opts?.email ?? null,
    }),

  closeSheet: () => set({ open: false, step: 'method', variant: 'fresh', path: 'email' }),

  goTo: (step) => set({ step }),

  setPath: (path) => set({ path }),

  setIdentity: ({ fullName, email }) =>
    set((s) => ({ fullName: fullName ?? s.fullName, email: email ?? s.email })),
}))
