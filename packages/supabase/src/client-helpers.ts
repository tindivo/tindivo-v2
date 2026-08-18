import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export type TindivoBrowserClient = ReturnType<typeof createBrowserClient<Database>>

export interface BrowserClientOptions {
  /** `process.env.NEXT_PUBLIC_SUPABASE_URL` de la app que llama. */
  url: string | undefined
  /** `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` de la app que llama. */
  anonKey: string | undefined
  /**
   * Clave de almacenamiento de la sesión. **Distinta en cada app.**
   *
   * Las cinco apps comparten dominio —en local solo cambia el puerto, y en
   * producción son subdominios de `tindivo.com`—, así que dos apps con la misma
   * clave se pisan la sesión: entrar en el panel del negocio cambiaría la cuenta
   * en la app del motorizado. En uso: `tindivo-{customer,negocios,driver,admin}-auth`.
   */
  storageKey: string
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
