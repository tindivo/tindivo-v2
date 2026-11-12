/**
 * Migración 0286: el antifraude solo cuenta lo de los últimos 24 meses (decisión de Jesús, 2026-11-12).
 *
 * Contra la base LOCAL, con el cliente de servicio (las funciones son solo de `service_role`):
 *  · un strike de hace 25 meses ya no exige prepago; uno de hace 23 sí;
 *  · un número cuyo único respaldo es una fila del directorio sin uso por más de 24 meses deja de
 *    ser confiable; con uso dentro de la ventana, sí;
 *  · quien recicla un número no hereda la confianza mientras la asignación del otro dueño siga
 *    dentro de la ventana, y sí cuando pasó;
 *  · la purga anonimiza los strikes vencidos y elimina el directorio y las asignaciones vencidos,
 *    sin tocar lo que sigue dentro de la ventana.
 *
 * Los casos usan teléfonos únicos y clientes propios sin entregas: `delivered` es terminal y un
 * historial de entregas daría «trusted» por el motivo equivocado.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const CLAVE = 'test-password-12345'
const MESES = (n: number) => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString()
}

interface Cliente {
  id: string
  tel9: string
}

const clientes: Cliente[] = []
const directorio: string[] = []
const strikes: string[] = []
const telefonosAsignados: string[] = []

function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const { data: auth, error: authErr } = await db.auth.admin.createUser({
    email: `ventana-${tel9}@integration.local`,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Ventana' },
  })
  if (authErr) throw new Error(`no se pudo crear el auth user: ${authErr.message}`)
  const cliente = { id: auth.user.id, tel9 }
  const { error } = await db.from('customer_profiles').insert({
    user_id: cliente.id,
    full_name: 'Vecino Ventana',
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (error) throw new Error(`no se pudo crear el perfil: ${error.message}`)
  clientes.push(cliente)
  return cliente
}

async function sembrarStrikes(tel9: string, cuantos: number, createdAt: string) {
  const filas = Array.from({ length: cuantos }, () => ({
    phone: tel9,
    reason: 'no_show',
    delivery_reference: `ref-ventana-${tel9}`,
    created_at: createdAt,
  }))
  const { data, error } = await db.from('customer_strikes').insert(filas).select('id')
  if (error) throw new Error(`no se pudieron sembrar los strikes: ${error.message}`)
  for (const s of data ?? []) strikes.push(s.id)
  return (data ?? []).map((s) => s.id)
}

async function sembrarDirectorio(tel9: string, usadoHace: string) {
  const { data, error } = await db
    .from('address_directory')
    .insert({
      phone: tel9,
      reference: 'Casa de la ventana',
      source: 'business_created',
      created_at: usadoHace,
      updated_at: usadoHace,
      last_used_at: usadoHace,
    })
    .select('id, created_at, updated_at, last_used_at')
    .single()
  if (error) throw new Error(`no se pudo sembrar el directorio: ${error.message}`)
  directorio.push(data.id)
  return data
}

async function asignacionTerminada(userId: string, tel9: string, terminoHace: string) {
  const inicio = new Date(new Date(terminoHace).getTime() - 30 * 86_400_000).toISOString()
  const { data, error } = await db
    .from('phone_assignments')
    .insert({
      phone: `+51${tel9}`,
      user_id: userId,
      started_at: inicio,
      start_reason: 'verification',
      ended_at: terminoHace,
      end_reason: 'replaced',
    })
    .select('id')
    .single()
  if (error) throw new Error(`no se pudo sembrar la asignación: ${error.message}`)
  telefonosAsignados.push(`+51${tel9}`)
  return data.id
}

const requierePrepago = async (c: Cliente) => {
  const { data, error } = await db.rpc('customer_requires_prepayment', {
    p_user_id: c.id,
    p_phone: c.tel9,
    p_reference: `ref-ventana-${c.tel9}`,
  })
  if (error) throw new Error(error.message)
  return data
}

const decision = async (c: Cliente) => {
  const { data, error } = await db.rpc('customer_contraentrega_decision', {
    p_customer_user_id: c.id,
  })
  if (error) throw new Error(error.message)
  return data
}

describe('0286 · el antifraude solo cuenta lo de los últimos 24 meses', () => {
  afterEach(async () => {
    for (const id of strikes.splice(0)) await db.from('customer_strikes').delete().eq('id', id)
    for (const id of directorio.splice(0)) await db.from('address_directory').delete().eq('id', id)
    for (const tel of telefonosAsignados.splice(0)) {
      await db.from('phone_assignments').delete().eq('phone', tel)
    }
  })

  afterAll(async () => {
    for (const c of clientes.splice(0)) {
      await db.from('customer_profiles').delete().eq('user_id', c.id)
      await db.from('users').delete().eq('id', c.id)
      await db.auth.admin.deleteUser(c.id)
    }
  })

  it('dos strikes de hace 23 meses exigen prepago; de hace 25, no', async () => {
    const dentro = await crearCliente()
    await sembrarStrikes(dentro.tel9, 2, MESES(23))
    expect(await requierePrepago(dentro)).toBe(true)
    expect(await decision(dentro)).toBe('risk_blocked')

    const fuera = await crearCliente()
    await sembrarStrikes(fuera.tel9, 2, MESES(25))
    expect(await requierePrepago(fuera)).toBe(false)
    expect(await decision(fuera)).toBe('no_history')
  })

  it('un strike dentro de la ventana y otro fuera no suman', async () => {
    const c = await crearCliente()
    await sembrarStrikes(c.tel9, 1, MESES(23))
    await sembrarStrikes(c.tel9, 1, MESES(25))
    expect(await requierePrepago(c)).toBe(false)
  })

  it('el directorio sin uso por más de 24 meses deja de hacer confiable al número', async () => {
    const viejo = await crearCliente()
    await sembrarDirectorio(viejo.tel9, MESES(25))
    expect(await decision(viejo)).toBe('no_history')

    const vigente = await crearCliente()
    await sembrarDirectorio(vigente.tel9, MESES(23))
    expect(await decision(vigente)).toBe('trusted')
  })

  it('quien recicla un número no hereda la confianza dentro de la ventana', async () => {
    const anterior = await crearCliente()
    const nuevo = await crearCliente()
    // La fila del directorio le daría «trusted» al número si nadie más lo hubiera tenido.
    await sembrarDirectorio(nuevo.tel9, MESES(1))
    await asignacionTerminada(anterior.id, nuevo.tel9, MESES(23))
    expect(await decision(nuevo)).toBe('no_history')

    // Pasada la ventana, la asignación ajena ya no cuenta.
    await db.from('phone_assignments').delete().eq('phone', `+51${nuevo.tel9}`)
    await asignacionTerminada(anterior.id, nuevo.tel9, MESES(25))
    expect(await decision(nuevo)).toBe('trusted')
  })

  it('la purga anonimiza el strike vencido y deja el vigente', async () => {
    const c = await crearCliente()
    const [vencido] = await sembrarStrikes(c.tel9, 1, MESES(25))
    const [vigente] = await sembrarStrikes(c.tel9, 1, MESES(23))
    const { error } = await db.rpc('anonymize_old_customer_strikes', { p_limit: 1000 })
    expect(error).toBeNull()

    const { data: filas } = await db
      .from('customer_strikes')
      .select('id, phone, customer_user_id, delivery_reference, order_id')
      .in('id', [vencido ?? '', vigente ?? ''])
    const porId = new Map((filas ?? []).map((f) => [f.id, f]))
    expect(porId.get(vencido ?? '')).toMatchObject({
      phone: 'eliminado',
      customer_user_id: null,
      delivery_reference: null,
      order_id: null,
    })
    expect(porId.get(vigente ?? '')?.phone).toBe(c.tel9)
  })

  it('la purga elimina el directorio sin uso y deja el vigente', async () => {
    const c = await crearCliente()
    const viejo = await sembrarDirectorio(c.tel9, MESES(25))
    const nuevo = await sembrarDirectorio(c.tel9, MESES(23))
    const { error } = await db.rpc('purge_old_address_directory', { p_limit: 1000 })
    expect(error).toBeNull()
    const { data } = await db.from('address_directory').select('id').in('id', [viejo.id, nuevo.id])
    expect((data ?? []).map((f) => f.id)).toEqual([nuevo.id])
  })

  it('la purga elimina la asignación terminada hace más de 24 meses y deja las demás', async () => {
    const a = await crearCliente()
    const b = await crearCliente()
    const vencida = await asignacionTerminada(a.id, a.tel9, MESES(25))
    const vigente = await asignacionTerminada(b.id, b.tel9, MESES(23))
    const { error } = await db.rpc('purge_old_phone_assignments', { p_limit: 1000 })
    expect(error).toBeNull()
    const { data } = await db.from('phone_assignments').select('id').in('id', [vencida, vigente])
    expect((data ?? []).map((f) => f.id)).toEqual([vigente])
  })
})
