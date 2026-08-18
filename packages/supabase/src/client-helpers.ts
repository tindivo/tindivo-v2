import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/**
 * Clave de almacenamiento de la sesión, una por app.
 *
 * Las cinco apps comparten dominio —en local solo cambia el puerto, y en
 * producción son subdominios de `tindivo.com`—, así que dos apps con la misma
 * clave se pisan la sesión: entrar en el panel del negocio cambiaría la cuenta
 * en la app del motorizado.
 *
 * Viven aquí porque la de `customer` estaba escrita a mano en TRES sitios: el
 * cliente del navegador, el de servidor y el callback de OAuth. Tres copias de
 * una cadena que tiene que coincidir exactamente o la sesión no se encuentra, y
 * el día que una se escriba mal el síntoma será «no puedo entrar» con el motivo
 * en otro fichero.
 */
export const STORAGE_KEYS = {
  customer: 'tindivo-customer-auth',
  negocios: 'tindivo-negocios-auth',
  driver: 'tindivo-driver-auth',
  admin: 'tindivo-admin-auth',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export type TindivoBrowserClient = ReturnType<typeof createBrowserClient<Database>>

export interface BrowserClientOptions {
  /** `process.env.NEXT_PUBLIC_SUPABASE_URL` de la app que llama. */
  url: string | undefined
  /** `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` de la app que llama. */
  anonKey: string | undefined
  /** La clave de esta app. Usa `STORAGE_KEYS`, no una cadena suelta. */
  storageKey: StorageKey
}

/**
 * Cliente Supabase del navegador, tipado con el esquema de la base.
 *
 * La configuración se recibe, no se lee: `process.env.NEXT_PUBLIC_*` solo se
 * sustituye por su valor donde Next compila la referencia, y dejar esa lectura
 * aquí ataría el paquete a que las cinco apps lo declaren en
 * `transpilePackages`. Las apps pasan sus propias variables; este módulo pone
 * la validación, el tipado y la convención del `storageKey`.
 */
export function createTindivoBrowserClient({
  url,
  anonKey,
  storageKey,
}: BrowserClientOptions): TindivoBrowserClient {
  if (!url || !anonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createBrowserClient<Database>(url, anonKey, { auth: { storageKey } })
}
