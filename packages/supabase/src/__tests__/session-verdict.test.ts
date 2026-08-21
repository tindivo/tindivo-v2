import { AuthApiError, AuthRetryableFetchError, type User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { type GetUserResult, sessionVerdict, shouldClearStaleSession } from '../session-verdict'

const USUARIO = { id: 'u-1', email: 'cliente@e2e.local' } as unknown as User

const sinUsuario = (error: GetUserResult['error']): GetUserResult => ({
  data: { user: null },
  error,
})

/**
 * El caso que este helper existe para no repetir: la app se comía la sesión de
 * quien volvía tras un par de días. Al volver, el access token ya caducó, así
 * que la primera carga tiene que hablar con el servidor de auth; si esa llamada
 * fallaba por red, `getUser()` devolvía `user: null` y el código lo trataba
 * igual que una sesión revocada — llamaba a `signOutLocal`, que borra el
 * refresh token del dispositivo. Sesión buena, destruida y sin vuelta atrás.
 *
 * La distinción no es un matiz: es la diferencia entre reintentar y echar al
 * usuario.
 */
describe('sessionVerdict', () => {
  it('con usuario, la sesión vale', () => {
    expect(sessionVerdict({ data: { user: USUARIO }, error: null })).toBe('valid')
  })

  it('sin usuario y sin error, el servidor desmintió la sesión', () => {
    expect(sessionVerdict(sinUsuario(null))).toBe('invalid')
  })

  it('un fallo de red NO desmiente la sesión', () => {
    expect(sessionVerdict(sinUsuario(new AuthRetryableFetchError('fetch failed', 0)))).toBe(
      'unreachable',
    )
  })

  it('un 403 del servidor de auth sí la desmiente', () => {
    expect(
      sessionVerdict(sinUsuario(new AuthApiError('Invalid Refresh Token', 403, undefined))),
    ).toBe('invalid')
  })

  it('un 500 se cuenta como reintentable, no como sesión muerta', () => {
    // `AuthRetryableFetchError` es lo que auth-js emite también para 5xx: el
    // servidor no ha dicho que la sesión no valga, solo que no puede ahora.
    expect(sessionVerdict(sinUsuario(new AuthRetryableFetchError('server error', 500)))).toBe(
      'unreachable',
    )
  })
})

describe('shouldClearStaleSession', () => {
  it('solo limpia cuando la sesión está desmentida', () => {
    expect(shouldClearStaleSession(sinUsuario(null))).toBe(true)
    expect(shouldClearStaleSession({ data: { user: USUARIO }, error: null })).toBe(false)
  })

  it('NO limpia cuando no se pudo preguntar', () => {
    expect(
      shouldClearStaleSession(sinUsuario(new AuthRetryableFetchError('fetch failed', 0))),
    ).toBe(false)
  })
})
