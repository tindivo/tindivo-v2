'use client'

import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { useCourierStore } from './store'

/**
 * Entrar a Tindivo Entregas pide la cuenta AL PRINCIPIO, no al tocar «Pedir».
 *
 * Por dos razones que se vieron probando: (1) «Soy yo» solo existe con sesión,
 * y sin él hay que escribir los dos contactos a mano; (2) el borrador vive en
 * memoria y volver de Google recarga la página, así que pedir la cuenta al
 * final borraba todo lo escrito.
 *
 * La marca en `sessionStorage` sobrevive a esa recarga: al volver del login,
 * `resumeCourierAfterLogin` abre el mapa solo.
 */
const PENDING_KEY = 'tindivo:courier-after-login'

export async function openCourierFlow(): Promise<void> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  if (data.session) {
    useCourierStore.getState().openSheet()
    return
  }
  try {
    sessionStorage.setItem(PENDING_KEY, '1')
  } catch {
    // Sin storage (modo privado estricto): tras el login la persona vuelve a tocar.
  }
  useOnboarding.getState().openSheet({ next: null, inPlace: true })
}

/**
 * Si alguien entró a Entregas sin sesión y ya la tiene, abre el mapa. Se llama
 * al montar la app (vuelta de Google) y cada vez que se cierra el login (correo).
 * Si cerró el login sin entrar, la marca se descarta: no hay que sorprenderle
 * más tarde con un mapa que ya no pidió.
 */
export async function resumeCourierAfterLogin(): Promise<void> {
  let pending = false
  try {
    pending = sessionStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return
  }
  if (!pending || useOnboarding.getState().open) return
  const { data } = await getSupabaseBrowser().auth.getSession()
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // nada
  }
  if (data.session && !useCourierStore.getState().open) useCourierStore.getState().openSheet()
}
