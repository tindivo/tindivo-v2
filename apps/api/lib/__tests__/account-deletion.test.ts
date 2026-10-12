import { describe, expect, it } from 'vitest'
import { parseDeletionResult } from '../customer/account-deletion'

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
