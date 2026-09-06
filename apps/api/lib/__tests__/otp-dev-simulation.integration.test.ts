/**
 * EL SIMULACRO DE OTP, Y SOBRE TODO SUS DOS CANDADOS.
 *
 * En local no hay Twilio —`.env.local` no lleva las tres variables— y hasta el
 * 2026-09-04 eso dejaba el paso del celular muerto: `send-code` devolvía el 500
 * de "no disponible temporalmente" y no había forma de recorrer la pantalla del
 * código sin sellar `phone_verified_at` a mano por servicio. El simulacro abre
 * ese camino con un código maestro fijo.
 *
 * POR QUÉ ESTE TEST EXISTE, y no es por el camino feliz. Lo que se prueba de
 * verdad es que el atajo NO PUEDE ESCAPARSE A PRODUCCIÓN: es una verificación
 * de identidad, y un `if` mal puesto aquí convierte el antifraude del piloto en
 * decoración. El último caso es el que importa — los tres primeros solo
 * describen para qué sirve la puerta que ese caso vigila.
 *
 * Corre contra la DB LOCAL como el resto de la suite, llamando a los route
 * handlers de Next con un `Request` real (patrón de `push-subscriptions`): el
 * JWT es de verdad, así que `requireRole` valida contra el GoTrue local igual
 * que en producción.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { localClient } from './helpers/local-db'

// ── Keys locales de Supabase CLI (públicas y documentadas, igual que en
//    helpers/local-db.ts). `serverEnv()` valida perezosamente en la primera
//    request, así que basta con poblarlas antes de llamar a un handler.
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

import { POST as sendCode } from '../../app/api/v1/customer/phone/send-code/route'
import { POST as verifyCode } from '../../app/api/v1/customer/phone/verify/route'
import { DEV_OTP_CODE, OTP_DEV_SIMULATION } from '../twilio/client'

const BASE = 'http://localhost:3001/api/v1'
/**
 * `full_name` dado de alta en `vitest.global-setup.ts`: es lo único por lo que
 * el barrido reconoce a este vecino si la corrida muere antes del `afterAll`.
 */
const NOMBRE_FIXTURE = 'Vecino OTP'
/**
 * Teléfono propio y de esta corrida. No puede ser fijo: hay índice único sobre
 * el teléfono verificado, y dos corridas solapadas —o una que dejó restos—
 * chocarían con un 409 que no tiene nada que ver con lo que se prueba.
 */
const TELEFONO = `9${String(Date.now()).slice(-8)}`

let userId: string
let token: string

function pedir(
  handler: (req: Request) => Promise<Response>,
  ruta: string,
  body: unknown,
): Promise<Response> {
  return handler(
    new Request(`${BASE}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  )
}

async function perfil(): Promise<{ phone: string | null; phone_verified_at: string | null }> {
  const { data, error } = await localClient
    .from('customer_profiles')
    .select('phone, phone_verified_at')
    .eq('user_id', userId)
    .single()
  if (error) throw new Error(`leer el perfil falló: ${error.message}`)
  return data
}

describe('simulacro local de OTP', () => {
  beforeAll(async () => {
    const email = `otp-sim-${Date.now()}@integration.local`
    const password = 'test-password-12345'
    const { data, error } = await localClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: NOMBRE_FIXTURE },
    })
    if (error) throw new Error(`crear el usuario falló: ${error.message}`)
    userId = data.user.id

    // `public.users` y el rol `customer` los pone `handle_new_user` (0090). El
    // perfil NO: lo crea la app del cliente, y sin él el `.update()` de
    // `verify` tocaría CERO filas devolviendo `error: null` — un falso verde
    // silencioso, justo lo que este test tiene que poder distinguir.
    const { error: perfErr } = await localClient
      .from('customer_profiles')
      .insert({ user_id: userId, full_name: NOMBRE_FIXTURE })
    if (perfErr) throw new Error(`crear el perfil falló: ${perfErr.message}`)

    // Cliente aparte y efímero: firmar con `localClient` le pondría la sesión
    // del usuario encima del service_role y las lecturas de verificación
    // pasarían a estar sujetas a RLS.
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    const { data: sesion, error: loginErr } = await anon.auth.signInWithPassword({
      email,
      password,
    })
    if (loginErr || !sesion.session) {
      throw new Error(`entrar falló: ${loginErr?.message ?? 'sin sesión'}`)
    }
    token = sesion.session.access_token
  })

  afterAll(async () => {
    if (!userId) return
    // `customer_otp_attempts` no tiene FK a `users`: no se va sola.
    await localClient.from('customer_otp_attempts').delete().eq('user_id', userId)
    await localClient.from('customer_profiles').delete().eq('user_id', userId)
    await localClient.from('users').delete().eq('id', userId)
    await localClient.auth.admin.deleteUser(userId)
  })

  it('está activo en la suite: sin Twilio y fuera de producción', () => {
    expect(OTP_DEV_SIMULATION).toBe(true)
  })

  it('da el envío por bueno sin mandar nada, y sin gastar el tope de 3 en 24h', async () => {
    // Cuatro envíos: uno más que `MAX_ATTEMPTS_PER_24H`. El tope protege una
    // factura de Twilio que aquí no existe, y aplicarlo dejaría la pantalla
    // intocable al cuarto intento con la única salida de vaciar la tabla a
    // mano. Sin envío no hay intento que apuntar.
    for (let i = 0; i < 4; i++) {
      const res = await pedir(sendCode, '/customer/phone/send-code', { phone: TELEFONO })
      expect(res.status, `el envío ${i + 1} debería pasar`).toBe(200)
      const { data } = await res.json()
      // 'dev' y no 'sms': el front no lo mira, pero quien lea una respuesta
      // tiene que poder saber si aquí hubo un SMS de verdad.
      expect(data).toEqual({ sent: true, channel: 'dev' })
    }

    const { count } = await localClient
      .from('customer_otp_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    expect(count ?? 0).toBe(0)
  })

  it('rechaza un código que no es el maestro, y NO sella el perfil', async () => {
    const res = await pedir(verifyCode, '/customer/phone/verify', {
      phone: TELEFONO,
      code: '123456',
    })
    expect(res.status).toBe(422)

    // Lo importante no es el 422 sino esto: un rechazo que dejara el perfil
    // sellado sería exactamente el agujero que el simulacro no puede abrir.
    expect(await perfil()).toEqual({ phone: null, phone_verified_at: null })
  })

  it('con el código maestro sella el teléfono en E.164, como haría Twilio', async () => {
    const res = await pedir(verifyCode, '/customer/phone/verify', {
      phone: TELEFONO,
      code: DEV_OTP_CODE,
    })
    expect(res.status).toBe(200)

    // El sellado sale de la MISMA rama que usa el camino real, no de un atajo
    // aparte: si el formato de `phone` cambiara, cambiaría para los dos.
    const p = await perfil()
    expect(p.phone).toBe(`+51${TELEFONO}`)
    expect(p.phone_verified_at).not.toBeNull()
  })

  it('EN PRODUCCIÓN EL SIMULACRO ESTÁ CERRADO, aunque falten las variables', async () => {
    // El caso que justifica el archivo. Se reimporta el módulo con `NODE_ENV`
    // de producción y sin Twilio —el peor escenario imaginable, el del
    // despliegue al que se le olvidaron las credenciales— y el atajo tiene que
    // seguir cerrado: ahí el endpoint debe fallar, no dejar entrar a cualquiera
    // con seis ceros.
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    try {
      const enProduccion = await import('../twilio/client')
      expect(enProduccion.twilioClient).toBeNull()
      expect(enProduccion.OTP_DEV_SIMULATION).toBe(false)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
