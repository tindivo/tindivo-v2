/**
 * Límite de frecuencia de las alertas operativas EN EL RECEPTOR (send-push):
 * `claim_ops_alert(kind, ventana)` reserva el turno de forma atómica en la base.
 * Contra la base local; solo service_role puede llamarla (0263).
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const KIND = `test_kind_${process.pid}_${Date.now()}`

async function claim(kind: string, window = '30 minutes') {
  const { data, error } = await localClient.rpc('claim_ops_alert', {
    p_kind: kind,
    p_window: window,
  })
  if (error) throw new Error(error.message)
  return data
}

beforeAll(async () => {
  await localClient.from('ops_alert_throttle').delete().like('kind', 'test_kind_%')
})
afterAll(async () => {
  await localClient.from('ops_alert_throttle').delete().like('kind', 'test_kind_%')
})

describe('claim_ops_alert · un turno por tipo y ventana', () => {
  it('el primero de un tipo pasa; el segundo dentro de la ventana, no', async () => {
    expect(await claim(KIND)).toBe(true)
    expect(await claim(KIND)).toBe(false)
  })

  it('otro tipo no queda tapado', async () => {
    expect(await claim(`${KIND}_otro`)).toBe(true)
  })

  it('pasada la ventana vuelve a pasar', async () => {
    const k = `${KIND}_vieja`
    expect(await claim(k)).toBe(true)
    await localClient
      .from('ops_alert_throttle')
      .update({ last_sent_at: new Date(Date.now() - 31 * 60_000).toISOString() })
      .eq('kind', k)
    expect(await claim(k)).toBe(true)
    expect(await claim(k)).toBe(false)
  })

  it('llamadas simultáneas del mismo tipo: pasa exactamente una', async () => {
    const k = `${KIND}_carrera`
    const r = await Promise.all(Array.from({ length: 8 }, () => claim(k)))
    expect(r.filter(Boolean)).toHaveLength(1)
  })

  it('la clave anónima NO puede reservar turnos ni leer la tabla', async () => {
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    const rpc = await anon.rpc('claim_ops_alert' as never, { p_kind: KIND } as never)
    expect(rpc.error).not.toBeNull()
    const sel = await anon.from('ops_alert_throttle' as never).select('*')
    expect(sel.error !== null || (sel.data ?? []).length === 0).toBe(true)
  })
})
