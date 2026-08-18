import { createServerClient } from '@supabase/ssr'
import { type BrowserClientOptions, STORAGE_KEYS } from './client-helpers'
import type { Database } from './database.types'

export { STORAGE_KEYS }

/**
 * Los métodos de cookies que espera `@supabase/ssr`, derivados de la propia
 * librería en vez de reescritos a mano: si su firma cambia, esto deja de
 * compilar en lugar de mentir.
 */
type ServerClientOptions = NonNullable<Parameters<typeof createServerClient>[2]>
export type ServerCookieMethods = ServerClientOptions['cookies']

export type TindivoServerClient = ReturnType<typeof createServerClient<Database>>

export interface ServerClientConfig extends BrowserClientOptions {
  /**
   * Adaptador de cookies del framework. El paquete NO importa `next/headers`:
   * eso lo ataría a Next y a que las cinco apps lo declaren en
   * `transpilePackages`, que es el mismo error que ya costó una tarde con
   * `createTindivoBrowserClient`. La app pasa su `cookies()`.
   *
   * En un Server Component `setAll` no puede escribir: pásalo vacío. Solo el
   * callback de OAuth y las Route Handlers necesitan la mitad de escritura.
   */
  cookies: ServerCookieMethods
}

/**
 * Cliente Supabase del servidor, tipado y con el `storageKey` de la app.
 *
 * Existe por la misma razón que su gemelo del navegador, y por una propia: el
 * `storageKey` decide el nombre de la cookie donde vive la sesión. Un cliente de
 * servidor construido sin él busca la cookie por defecto (`sb-<ref>-auth-token`)
 * mientras el navegador de esa app escribe en `tindivo-<app>-auth`, así que
 * **no encuentra ninguna sesión y no falla**: devuelve "no hay usuario", que es
 * indistinguible de un visitante anónimo. Eso es exactamente lo que le pasaba
 * al cliente de servidor de `apps/api`, muerto desde que se escribió.
 *
 * `Docs/03-arquitectura.md` §5.4 prescribía wrappers para los dos lados desde el
 * primer día; este es el segundo, y `pnpm check:auth` ya lo vigila.
 */
export function createTindivoServerClient({
  url,
  anonKey,
  storageKey,
  cookies,
}: ServerClientConfig): TindivoServerClient {
  if (!url || !anonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createServerClient<Database>(url, anonKey, { cookies, auth: { storageKey } })
}
