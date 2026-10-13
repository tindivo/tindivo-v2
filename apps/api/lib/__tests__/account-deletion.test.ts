import { describe, expect, it } from 'vitest'
import { isRetryableTxError, parseDeletionResult, withTxRetry } from '../customer/account-deletion'

describe('borrado de cuenta: lo que responde la base', () => {
  it('borrada y ya borrada son éxito', () => {
    expect(
      parseDeletionResult({ status: 'deleted', ordersAnonymized: 2, courierOrdersAnonymized: 0 }),
    ).toEqual({ kind: 'done' })
    expect(parseDeletionResult({ status: 'already_deleted' })).toEqual({ kind: 'done' })
  })

  it('cada bloqueo trae su motivo en español, sin jerga', () => {
    const activos = parseDeletionResult({ status: 'blocked', reason: 'active_orders' })
    const dinero = parseDeletionResult({ status: 'blocked', reason: 'open_money_reports' })
    const roles = parseDeletionResult({ status: 'blocked', reason: 'other_roles' })
    expect(activos.kind).toBe('blocked')
    expect(dinero.kind).toBe('blocked')
    expect(roles.kind).toBe('blocked')
    if (activos.kind === 'blocked') expect(activos.detail).toMatch(/pedido/i)
    if (dinero.kind === 'blocked') expect(dinero.detail).toMatch(/devoluci|apelaci/i)
    if (roles.kind === 'blocked') expect(roles.detail).toMatch(/soporte/i)
  })

  it('una respuesta que no se entiende NO cuenta como borrada', () => {
    expect(() => parseDeletionResult(null)).toThrow()
    expect(() => parseDeletionResult({ status: 'quien-sabe' })).toThrow()
    expect(() => parseDeletionResult({ status: 'blocked', reason: 'nuevo' })).toThrow()
  })
})

describe('borrado de cuenta: reintento ante deadlock', () => {
  const sleep = async () => {}
  const dead = { data: null, error: { code: '40P01' } }
  const ok = { data: { status: 'deleted' }, error: null }

  it('solo 40P01 y 40001 se reintentan', () => {
    expect(isRetryableTxError({ code: '40P01' })).toBe(true)
    expect(isRetryableTxError({ code: '40001' })).toBe(true)
    expect(isRetryableTxError({ code: '23505' })).toBe(false)
    expect(isRetryableTxError({ code: 'P0001' })).toBe(false)
    expect(isRetryableTxError(null)).toBe(false)
  })

  it('un deadlock seguido de éxito termina bien en el segundo intento', async () => {
    let calls = 0
    const r = await withTxRetry(async () => (++calls === 1 ? dead : ok), { sleep })
    expect(r).toBe(ok)
    expect(calls).toBe(2)
  })

  it('se rinde tras 3 intentos y devuelve el error', async () => {
    let calls = 0
    const r = await withTxRetry(
      async () => {
        calls++
        return dead
      },
      { sleep },
    )
    expect(calls).toBe(3)
    expect(r.error?.code).toBe('40P01')
  })

  it('un error que no es de carrera no se reintenta', async () => {
    let calls = 0
    await withTxRetry(
      async () => {
        calls++
        return { data: null, error: { code: 'P0002' } }
      },
      { sleep },
    )
    expect(calls).toBe(1)
  })
})
