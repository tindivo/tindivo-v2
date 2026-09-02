'use client'

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
    return 'El inicio con Google no está disponible por ahora. Usa tu correo para continuar.'
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Este correo ya tiene una cuenta. Inicia sesión.'
  }
  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentar.'
  }
  return message
}

/** Registra la aceptación de términos; tolera duplicados (unique user_id+version). */
async function acceptTerms(userId: string) {
  const supabase = getSupabaseBrowser()
  const { error } = await supabase
    .from('terms_acceptance')
    .insert({ user_id: userId, version: TERMS_VERSION })
  // 23503 = FK violation: el user_id no existe en public.users (sesión obsoleta de un
  // usuario borrado). Mensaje claro en vez del error crudo de Postgres.
  if (error && error.code === '23503') {
    throw new Error('Tu sesión ya no es válida. Cierra sesión e inicia de nuevo.')
  }
  if (error && error.code !== '23505') throw new Error(error.message)
}

/**
 * Crea cuenta con correo (sin verificación: confirmation OFF en el dashboard).
 * Crea también customer_profiles — primera escritura de la fila del perfil.
 */
export async function signUpWithEmail(input: {
  fullName: string
  email: string
  password: string
}): Promise<{ userId: string }> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName } },
  })
  if (error) throw new Error(authErrorMessage(error.message))
  if (!data.session || !data.user) {
    // Defensive: solo ocurre si "Confirm email" sigue activado en el dashboard.
    throw new Error('Tu cuenta requiere confirmación por correo. Revisa tu bandeja para activarla.')
  }
  await acceptTerms(data.user.id)
  await upsertProfile({ userId: data.user.id, fullName: input.fullName })
  return { userId: data.user.id }
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

/** Detecta si el error es un duplicado (PK unique violation), sin importar
 * cómo el cliente Supabase mapee el código de PostgREST (23505, 409, etc.). */
function isDuplicateKeyError(err: {
  code?: string | number
  message?: string
  details?: string
}): boolean {
  const c = err.code
  if (c === '23505' || c === 23505 || c === '409' || c === 409) return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    msg.includes('duplicate key') ||
    msg.includes('unique violation') ||
    msg.includes('already exists')
  )
}

/**
 * Crea o actualiza el perfil (full_name es NOT NULL: siempre se envía).
 * No usa upsert(on_conflict): PostgREST exigiría privilegio UPDATE sobre TODAS
 * las columnas enviadas (incluida user_id), pero el grant de UPDATE es por
 * columnas (0004_rls.sql).
 *
 * Primero verifica si ya existe la fila (SELECT maybeSingle); si existe → UPDATE,
 * si no → INSERT. Esto evita el 409 innecesario en el caso común de reanudar
 * un onboarding interrumpido, y además no depende de que el cliente Supabase
 * propague el código PG exacto en el error.
 */
export async function upsertProfile(input: { userId: string; fullName: string; phone?: string }) {
  const supabase = getSupabaseBrowser()
  const patch = {
    full_name: input.fullName,
    ...(input.phone ? { phone: input.phone } : {}),
  }

  // Verificar si ya existe (caso común: onboarding reanudado)
  const { data: existing, error: checkErr } = await supabase
    .from('customer_profiles')
    .select('user_id')
    .eq('user_id', input.userId)
    .maybeSingle()

  if (checkErr) throw new Error(checkErr.message)

  if (existing) {
    // UPDATE: la fila ya existe
    const { error: updErr } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('user_id', input.userId)
    if (updErr) throw new Error(updErr.message)
    return
  }

  // INSERT: primera vez
  const { error: insErr } = await supabase
    .from('customer_profiles')
    .insert({ user_id: input.userId, ...patch })

  if (!insErr) return

  // Si aún así falla por duplicado (race condition extremadamente rara), UPDATE
  if (isDuplicateKeyError(insErr)) {
    const { error: updErr } = await supabase
      .from('customer_profiles')
      .update(patch)
      .eq('user_id', input.userId)
    if (updErr) throw new Error(updErr.message)
    return
  }

  throw new Error(insErr.message)
}

/** Guarda el teléfono (formato 9XXXXXXXX, consistente con PhonePeSchema). */
export async function savePhone(input: { userId: string; fullName: string; phone: string }) {
  await upsertProfile(input)
}

/** Camino Google: confirma el nombre visible y registra la aceptación de términos. */
export async function saveGoogleName(input: { userId: string; fullName: string }) {
  await acceptTerms(input.userId)
  await upsertProfile(input)
}

/**
 * Guarda la primera dirección como "Casa" predeterminada (+ coords default del perfil).
 * Limpia is_default previos por el índice único parcial customer_addresses_default_per_user_idx.
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
  const supabase = getSupabaseBrowser()
  const { error: clearErr } = await supabase
    .from('customer_addresses')
    .update({ is_default: false })
    .eq('user_id', input.userId)
    .eq('is_default', true)
  if (clearErr) throw new Error(clearErr.message)

  const { error } = await supabase.from('customer_addresses').insert({
    user_id: input.userId,
    label: input.label?.trim() || 'Casa',
    line: input.line?.trim() || null,
    reference: input.reference.trim(),
    coordinates_lat: input.lat,
    coordinates_lng: input.lng,
    is_default: true,
    // Se llega aquí con un punto que salió de un gesto o del sensor: el
    // formulario no deja guardar de otra forma (`canSaveAddress`). Por eso se
    // sella confirmada, y la precisión viaja con ella — NULL significa que el
    // pin se puso a mano, mismo convenio que `capture_delivery_address` (0147).
    location_confirmed_at: new Date().toISOString(),
    location_accuracy_m: input.accuracyM ?? null,
  })
  if (error) throw new Error(error.message)

  if (input.lat != null && input.lng != null) {
    await supabase
      .from('customer_profiles')
      .update({
        default_coordinates_lat: input.lat,
        default_coordinates_lng: input.lng,
        ...(input.accuracyM != null
          ? { default_location_accuracy_m: Math.round(input.accuracyM) }
          : {}),
      })
      .eq('user_id', input.userId)
  }
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
      .select('full_name,phone')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('customer_addresses').select('id').eq('user_id', userId).limit(1),
  ])
  return {
    hasProfile: Boolean(prof),
    hasPhone: Boolean(prof?.phone),
    hasAddress: (addr ?? []).length > 0,
    fullName: prof?.full_name ?? null,
  }
}
