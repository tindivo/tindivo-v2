import { type AuthError, isAuthRetryableFetchError, type User } from '@supabase/supabase-js'

/**
 * Qué se puede concluir de un `auth.getUser()`.
 *
 * - `valid`: hay usuario, confirmado contra el servidor de auth.
 * - `invalid`: el servidor respondió y dice que esta sesión no vale (revocada,
 *   usuario borrado, refresh token muerto). Aquí SÍ toca limpiar.
 * - `unreachable`: no se pudo preguntar. La sesión no está desmentida, solo sin
 *   confirmar. Aquí NO se toca nada.
 */
export type SessionVerdict = 'valid' | 'invalid' | 'unreachable'

/** La forma de lo que devuelve `auth.getUser()`, sin atarse a su genérico. */
export interface GetUserResult {
  data: { user: User | null }
  error: AuthError | null
}

/**
 * Traduce un `getUser()` a una decisión, porque su valor de retorno NO es una.
 *
 * `getUser()` devuelve `user: null` en dos situaciones que no se parecen en
 * nada: la sesión no vale, y no hubo forma de preguntar. Un móvil sin cobertura,
 * un portal cautivo de wifi o un hipo del servidor de auth dan exactamente el
 * mismo `user: null` que una cuenta borrada.
 *
 * Tratar las dos igual es lo que hacía que volver a la app tras un par de días
 * pidiera login otra vez. Al volver, el access token ya caducó, así que la
 * primera carga TIENE que hablar con el servidor de auth; si esa llamada falla
 * —y en un pueblo con datos móviles flojos falla—, el código veía `user: null`
 * y llamaba a `signOutLocal()`, que borra el refresh token del dispositivo. La
 * sesión era buena y quedaba destruida, sin vuelta atrás salvo volver a entrar.
 *
 * Lo llamativo es que auth-js ya distingue los dos casos y hace lo correcto: en
 * `_recoverAndRefresh` solo borra la sesión si el error NO es reintentable
 * (`isAuthRetryableFetchError`), y ante un fallo de red la CONSERVA a propósito.
 * Éramos nosotros los que borrábamos lo que la librería había decidido guardar.
 *
 * Comprobado contra `@supabase/auth-js` 2.106: con el servidor de auth caído,
 * `getUser()` resuelve con `user: null` y `AuthRetryableFetchError`, y la sesión
 * sigue intacta en el almacenamiento.
 */
export function sessionVerdict({ data, error }: GetUserResult): SessionVerdict {
  if (data.user) return 'valid'
  if (error && isAuthRetryableFetchError(error)) return 'unreachable'
  return 'invalid'
}

/**
 * ¿Toca limpiar la sesión de este dispositivo?
 *
 * Azúcar sobre `sessionVerdict` para el único uso que tiene: decidir si se
 * llama a `signOutLocal`. Se lee mejor en el sitio de la decisión y deja claro
 * que `unreachable` NO es motivo para cerrar nada.
 */
export function shouldClearStaleSession(result: GetUserResult): boolean {
  return sessionVerdict(result) === 'invalid'
}
