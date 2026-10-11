/**
 * MV4a: las cinco primeras rutas que la app nativa del cliente necesita porque
 * la web las leía directo de Supabase. Contra la base local.
 *
 *  · `GET /customer/profile`         el perfil de la SESIÓN, nunca el de otro.
 *  · `GET /customer/payment-options` expone la decisión de la base, no la recalcula.
 *  · `GET /public/config`            solo las claves públicas; dinero como texto (D-39).
 *  · `GET /public/landmarks`         solo las activas.
 *  · `GET /public/courier/directory` sin teléfono ni WhatsApp de los comercios.
 *
 * Clientes propios con el nombre `Vecino Integración`, que el globalSetup ya
 * barre si la corrida muere. Los landmarks y comercios llevan el prefijo
 * `ZZ Test MV4a` y se borran al final.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as getPaymentOptions } from '../../app/api/v1/customer/payment-options/route'
import { GET as getProfile } from '../../app/api/v1/customer/profile/route'
import { GET as getPublicConfig } from '../../app/api/v1/public/config/route'
import { GET as getDirectory } from '../../app/api/v1/public/courier/directory/route'
import { GET as getLandmarks } from '../../app/api/v1/public/landmarks/route'
import { localClient as db } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const NOMBRE = 'Vecino Integración'
const CLAVE = 'test-password-12345'
const PREFIJO = 'ZZ Test MV4a'

interface Cliente {
  id: string
  token: string
  tel9: string
}

const clientes: Cliente[] = []
const strikes: string[] = []
const landmarks: string[] = []
const comercios: string[] = []

function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

async function crearCliente(
  perfil: null | {
    verificado?: boolean
    contraentregaBloqueada?: boolean
    bloqueadoHasta?: string
  } = {},
): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const email = `mv4a-${tel9}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE },
  })
  if (error) throw new Error(`crear el cliente falló: ${error.message}`)
  const id = data.user.id
  if (perfil) {
    const { error: perr } = await db.from('customer_profiles').insert({
      user_id: id,
      full_name: NOMBRE,
      phone: `+51${tel9}`,
      phone_verified_at: perfil.verificado === false ? null : new Date().toISOString(),
      contraentrega_blocked: perfil.contraentregaBloqueada ?? false,
      blocked_until: perfil.bloqueadoHasta ?? null,
    })
    if (perr) throw new Error(`crear el perfil falló: ${perr.message}`)
  }
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: serr } = await anon.auth.signInWithPassword({ email, password: CLAVE })
  if (serr || !s.session) throw new Error(`entrar falló: ${serr?.message}`)
  const c = { id, token: s.session.access_token, tel9 }
  clientes.push(c)
  return c
}

function pedir(handler: (req: Request) => Promise<Response> | Response, bearer?: string) {
  return handler(
    new Request('http://localhost:3001/api/v1/x', {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    }),
  )
}

afterAll(async () => {
  for (const id of strikes.splice(0)) await db.from('customer_strikes').delete().eq('id', id)
  for (const id of landmarks.splice(0)) await db.from('map_landmarks').delete().eq('id', id)
  for (const id of comercios.splice(0)) await db.from('directory_businesses').delete().eq('id', id)
  for (const c of clientes.splice(0)) {
    await db.from('customer_profiles').delete().eq('user_id', c.id)
    await db.from('users').delete().eq('id', c.id)
    await db.auth.admin.deleteUser(c.id)
  }
})

describe('GET /customer/profile', () => {
  it('sin sesión: 401', async () => {
    const res = await pedir(getProfile)
    expect(res.status).toBe(401)
  })

  it('devuelve el perfil de la sesión, con el teléfono verificado', async () => {
    const c = await crearCliente()
    const res = await pedir(getProfile, c.token)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toMatchObject({
      fullName: NOMBRE,
      phone: `+51${c.tel9}`,
      phoneVerified: true,
      contraentregaBlocked: false,
      blockedUntil: null,
      blocked: false,
    })
    expect(typeof data.phoneVerifiedAt).toBe('string')
  })

  it('teléfono sin verificar y bloqueo preventivo vigente', async () => {
    const hasta = new Date(Date.now() + 86_400_000).toISOString()
    const c = await crearCliente({ verificado: false, bloqueadoHasta: hasta })
    const { data } = await (await pedir(getProfile, c.token)).json()
    expect(data.phoneVerified).toBe(false)
    expect(data.phoneVerifiedAt).toBeNull()
    expect(data.blocked).toBe(true)
  })

  it('un bloqueo ya vencido no cuenta', async () => {
    const c = await crearCliente({ bloqueadoHasta: new Date(Date.now() - 1000).toISOString() })
    const { data } = await (await pedir(getProfile, c.token)).json()
    expect(data.blocked).toBe(false)
  })

  it('sin perfil: 404 con razón estable', async () => {
    const c = await crearCliente(null)
    const res = await pedir(getProfile, c.token)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('not_found')
    expect(body.detail).toBe('customer_profile_not_found')
  })

  it('no hay forma de pedir el de otro: cada sesión ve el suyo', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const da = (await (await pedir(getProfile, a.token)).json()).data
    const dbb = (await (await pedir(getProfile, b.token)).json()).data
    expect(da.phone).toBe(`+51${a.tel9}`)
    expect(dbb.phone).toBe(`+51${b.tel9}`)
  })
})

describe('GET /customer/payment-options', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir(getPaymentOptions)).status).toBe(401)
  })

  it('cliente nuevo: prepago, por falta de historial', async () => {
    const c = await crearCliente()
    const res = await pedir(getPaymentOptions, c.token)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      contraentregaAllowed: false,
      prepayRequired: true,
      reason: 'no_history',
    })
  })

  it('el teléfono conocido por el directorio abre la contraentrega', async () => {
    const c = await crearCliente()
    const { data: fila, error } = await db
      .from('address_directory')
      .insert({ phone: c.tel9, reference: 'Casa junto a la bodega', source: 'admin_curated' })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    try {
      const { data } = await (await pedir(getPaymentOptions, c.token)).json()
      expect(data).toEqual({ contraentregaAllowed: true, prepayRequired: false, reason: 'trusted' })
    } finally {
      await db.from('address_directory').delete().eq('id', fila.id)
    }
  })

  it('el riesgo manda sobre el historial: bloqueo de contraentrega', async () => {
    const c = await crearCliente({ contraentregaBloqueada: true })
    const { error } = await db
      .from('address_directory')
      .insert({ phone: c.tel9, reference: 'Casa junto a la bodega', source: 'admin_curated' })
    if (error) throw new Error(error.message)
    try {
      const { data } = await (await pedir(getPaymentOptions, c.token)).json()
      expect(data).toEqual({
        contraentregaAllowed: false,
        prepayRequired: true,
        reason: 'risk_blocked',
      })
    } finally {
      await db.from('address_directory').delete().eq('phone', c.tel9)
    }
  })

  it('los strikes del teléfono también son riesgo', async () => {
    const c = await crearCliente()
    const filas = [1, 2].map(() => ({ phone: c.tel9, reason: 'no_show' }))
    const { data: ins, error } = await db.from('customer_strikes').insert(filas).select('id')
    if (error) throw new Error(error.message)
    for (const s of ins ?? []) strikes.push(s.id)
    const { data } = await (await pedir(getPaymentOptions, c.token)).json()
    expect(data.reason).toBe('risk_blocked')
    expect(data.contraentregaAllowed).toBe(false)
  })
})

describe('GET /public/config', () => {
  it('sin sesión, con las claves públicas y el dinero como texto', async () => {
    const res = await pedir(getPublicConfig)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(Object.keys(data).sort()).toEqual(
      [
        'coverage',
        'coveragePolygon',
        'deliveryBands',
        'locationValidation',
        'maxCashBill',
        'maxChange',
        'prepayThreshold',
      ].sort(),
    )
    expect(data.deliveryBands).toMatchObject({
      near: expect.stringMatching(/^\d+\.\d{2}$/),
      far: expect.stringMatching(/^\d+\.\d{2}$/),
    })
    expect(data.prepayThreshold).toMatch(/^\d+\.\d{2}$/)
    expect(data.maxCashBill).toMatch(/^\d+\.\d{2}$/)
    expect(data.maxChange).toMatch(/^\d+\.\d{2}$/)
    expect(data.coverage.radiusKm).toEqual(expect.any(Number))
    expect(data.coveragePolygon.length).toBeGreaterThanOrEqual(3)
    expect(data.coveragePolygon[0]).toEqual({ lat: expect.any(Number), lng: expect.any(Number) })
  })

  it('el umbral sale de app_settings: cambiar la fila cambia la respuesta', async () => {
    const { data: previo } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'prepay_threshold')
      .single()
    try {
      await db.from('app_settings').update({ value: 77.5 }).eq('key', 'prepay_threshold')
      const { data } = await (await pedir(getPublicConfig)).json()
      expect(data.prepayThreshold).toBe('77.50')
    } finally {
      await db
        .from('app_settings')
        .update({ value: previo?.value as never })
        .eq('key', 'prepay_threshold')
    }
  })

  it('no filtra claves privadas', async () => {
    const texto = JSON.stringify((await (await pedir(getPublicConfig)).json()).data)
    for (const privada of ['commissions', 'client_compat', 'fraud_coverage', 'strikes']) {
      expect(texto).not.toContain(privada)
    }
  })
})

describe('GET /public/landmarks', () => {
  beforeAll(async () => {
    for (const [name, active] of [
      [`${PREFIJO} activo`, true],
      [`${PREFIJO} apagado`, false],
    ] as const) {
      const { data, error } = await db
        .from('map_landmarks')
        .insert({ name, category: 'otro', lat: -9.1511, lng: -78.2799, active })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      landmarks.push(data.id)
    }
  })

  it('lista las activas y no las apagadas', async () => {
    const res = await pedir(getLandmarks)
    expect(res.status).toBe(200)
    const { items } = (await res.json()).data as {
      items: { name: string; lat: number; lng: number; category: string }[]
    }
    const mios = items.filter((i) => i.name.startsWith(PREFIJO))
    expect(mios.map((i) => i.name)).toEqual([`${PREFIJO} activo`])
    expect(mios[0]).toMatchObject({ category: 'otro', lat: -9.1511, lng: -78.2799 })
  })
})

describe('GET /public/courier/directory', () => {
  beforeAll(async () => {
    for (const [name, visible] of [
      [`${PREFIJO} visible`, true],
      [`${PREFIJO} oculto`, false],
    ] as const) {
      const { data, error } = await db
        .from('directory_businesses')
        .insert({
          name,
          category: 'bodega',
          lat: -9.1512,
          lng: -78.2801,
          reference_text: 'Esquina de la plaza',
          phone: '999111222',
          whatsapp: '999333444',
          visible_on_map: visible,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      comercios.push(data.id)
    }
  })

  it('lista los visibles y NUNCA expone teléfono ni WhatsApp', async () => {
    const res = await pedir(getDirectory)
    expect(res.status).toBe(200)
    const { items } = (await res.json()).data as { items: Record<string, unknown>[] }
    const mios = items.filter((i) => String(i.name).startsWith(PREFIJO))
    expect(mios.map((i) => i.name)).toEqual([`${PREFIJO} visible`])
    expect(mios[0]).toMatchObject({ category: 'bodega', referenceText: 'Esquina de la plaza' })
    for (const item of items) {
      expect(item).not.toHaveProperty('phone')
      expect(item).not.toHaveProperty('whatsapp')
    }
    const texto = JSON.stringify(items)
    expect(texto).not.toContain('999111222')
    expect(texto).not.toContain('999333444')
  })
})
