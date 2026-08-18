import type { AuthError } from '@supabase/supabase-js'

/**
 * Lo mínimo que `signOutLocal` necesita del cliente, tipado por estructura.
 *
 * No se pide `SupabaseClient<Database>` a propósito: los frontends construyen
 * su cliente con `createBrowserClient` de `@supabase/ssr` y `apps/api` con
 * `createClient` de `@supabase/supabase-js`. Exigir la clase concreta obligaría
 * a este paquete a depender de las dos y a casar sus genéricos, sin ganar nada:
 * aquí solo se llama a `auth.signOut`.
 */
export interface SignOutCapableClient {
  auth: {
    signOut(options?: {
      scope?: 'global' | 'local' | 'others'
    }): Promise<{ error: AuthError | null }>
  }
}

/**
 * Cierra la sesión SOLO en este dispositivo. Es la única forma de cerrar sesión
 * en Tindivo: `[RNF-SEC-01]`, `[HU-X-005]`.
 *
 * `supabase.auth.signOut()` a secas usa `scope: 'global'`, que revoca TODOS los
 * refresh tokens del usuario contra el servidor de auth. Con eso, un motorizado
 * que cierra sesión en el móvil se cae también del navegador del local — que es
 * justo el bug que este helper existe para no repetir.
 *
 * Y el scope es por USUARIO, no por app: como Tindivo es multi-rol desde el día
 * 1, un global le tiraría además la sesión de cliente al mismo tiempo.
 *
 * Devuelve el error en lugar de lanzarlo, igual que supabase-js: quien cierra
 * sesión casi siempre quiere seguir adelante (limpiar estado, redirigir) aunque
 * la llamada de red haya fallado. El estado local se limpia igual.
 */
export async function signOutLocal(
  client: SignOutCapableClient,
): Promise<{ error: AuthError | null }> {
  return client.auth.signOut({ scope: 'local' })
}

/**
 * Cierra la sesión en TODOS los dispositivos del usuario, este incluido.
 *
 * Es la contrapartida de `signOutLocal`, y existe porque el logout por
 * dispositivo deja un hueco: quien pierde el móvil ya no tiene forma de cortar
 * el acceso. Aquí el scope global es la función, no un descuido.
 *
 * Vive en el mismo módulo que `signOutLocal` a propósito: son las dos únicas
 * salidas de sesión del producto, y tenerlas juntas obliga a elegir entre ellas
 * en vez de escribir un `signOut()` a secas. `pnpm check:auth` prohíbe el resto.
 *
 * NO es lo que debe hacer un botón de «cerrar sesión»: eso es `signOutLocal`.
 * Este va detrás de una acción explícita y con confirmación, porque echa al
 * usuario de dispositivos que no tiene delante.
 */
export async function signOutEverywhere(
  client: SignOutCapableClient,
): Promise<{ error: AuthError | null }> {
  return client.auth.signOut({ scope: 'global' })
}
