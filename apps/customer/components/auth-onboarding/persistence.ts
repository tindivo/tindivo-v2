'use client'

import { saveAddressRow } from '@/lib/address-save'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export const TERMS_VERSION = '2026-05'

/** Mensajes de Supabase auth mapeados a español peruano. */
function authErrorMessage(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes('provider is not enabled') ||
    m.includes('not enabled') ||
    m.includes('unsupported provider')
  ) {
    return 'El inicio con Google no está disponible por ahora. Vuelve a intentarlo en unos minutos.'
  }
  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  }
  return message
}

/** Registra la aceptación desde el servidor; repetir la versión conserva la fecha. */
async function acceptTerms() {
  await api.post('/customer/terms-acceptance', { version: TERMS_VERSION })
}

export async function signInWithEmail(input: { email: string; password: string }) {
  const supabase = getSupabaseBrowser()
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })
  if (error) throw new Error(authErrorMessage(error.message))
}

/**
 * Lanza el OAuth de Google; la página se recarga al volver (ver host: resume).
 * `prompt: 'select_account'` fuerza a Google a mostrar SIEMPRE el selector de cuenta:
 * sin esto, tras cerrar sesión el navegador reusaba en silencio la cuenta anterior y
 * era imposible entrar con otra (bug reportado por el socio).
 */
export async function signInWithGoogle() {
  const supabase = getSupabaseBrowser()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw new Error(authErrorMessage(error.message))
}

/** El servidor crea el perfil o cambia solo el nombre; nunca se manda el teléfono. */
export async function upsertProfile(input: { userId: string; fullName: string }) {
  await api.put('/customer/profile', { fullName: input.fullName })
}

/** Camino Google: confirma el nombre visible y registra la aceptación de términos. */
export async function saveGoogleName(input: { userId: string; fullName: string }) {
  await acceptTerms()
  await upsertProfile(input)
}

/**
 * Guarda una dirección como "Casa", con su punto y precisión.
 *
 * ERA EL CUARTO CAMINO QUE ESCRIBIA DIRECCIONES, y el único que quedaba fuera
 * de las reglas comunes: ponía `is_default: true` a secas —limpiando antes las
 * demás— y sellaba `location_confirmed_at` con `now()` aunque llegara sin
 * coordenada. Lo primero importaba porque a esta función la llama también
 * `placeOrder`, cuando el cliente pide con una dirección que no tenía guardada:
 * ahí le robaba la predeterminada a la suya de siempre sin decir nada.
 *
 * Ahora el guardado entero lo hace `saveAddressRow`, igual que el perfil y el
 * checkout. La dirección es la única fuente del punto guardado.
 */
export async function saveAddress(input: {
  userId: string
  reference: string
  lat: number | null
  lng: number | null
  label?: string
  line?: string | null
  accuracyM?: number | null
}) {
  const res = await saveAddressRow({
    userId: input.userId,
    previous: null,
    value: {
      label: input.label?.trim() || 'Casa',
      line: input.line?.trim() ?? '',
      reference: input.reference.trim(),
      coords: input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null,
      accuracyM: input.accuracyM ?? null,
    },
    makeDefault: 'auto',
  })
  // Aquí sí se lanza, al revés que en las hojas: esta función es un paso del
  // onboarding y quien la llama ya tiene su propio manejo de errores.
  if (!res.ok) throw new Error(res.error)

  // La dirección conserva su punto y precisión en customer_addresses.
  // No se duplica en el perfil: sus coordenadas predeterminadas no tienen consumidores.
}

export interface ProfileStatus {
  hasProfile: boolean
  hasPhone: boolean
  hasAddress: boolean
  fullName: string | null
}

/** Estado del perfil para decidir en qué paso reanudar el onboarding. */
export async function getProfileStatus(userId: string): Promise<ProfileStatus> {
  const supabase = getSupabaseBrowser()
  const [{ data: prof }, { data: addr }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('full_name,phone,phone_verified_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('customer_addresses').select('id').eq('user_id', userId).limit(1),
  ])
  return {
    hasProfile: Boolean(prof),
    hasPhone: Boolean(prof?.phone && prof.phone_verified_at),
    hasAddress: (addr ?? []).length > 0,
    fullName: prof?.full_name ?? null,
  }
}
