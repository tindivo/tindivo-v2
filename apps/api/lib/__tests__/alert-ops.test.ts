import { describe, expect, it, vi } from 'vitest'
import { createAlertOps, OPS_ALERT_DEDUPE_MS } from '../ops/alert-ops'

describe('alertOps · deduplicación', () => {
  it('la primera alerta de un tipo se manda', async () => {
    const send = vi.fn(async () => {})
    const alertOps = createAlertOps({ send, now: () => 0 })
    expect(await alertOps('otp_phone_limit_misconfigured', 'falta X')).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('otp_phone_limit_misconfigured', 'falta X')
  })

  it('el mismo tipo dentro de la ventana no se repite', async () => {
    let t = 0
    const send = vi.fn(async () => {})
    const alertOps = createAlertOps({ send, now: () => t })
    await alertOps('otp_phone_limit_misconfigured', 'a')
    t = OPS_ALERT_DEDUPE_MS - 1
    expect(await alertOps('otp_phone_limit_misconfigured', 'b')).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('pasada la ventana vuelve a mandarse', async () => {
    let t = 0
    const send = vi.fn(async () => {})
    const alertOps = createAlertOps({ send, now: () => t })
    await alertOps('otp_phone_limit_misconfigured', 'a')
    t = OPS_ALERT_DEDUPE_MS
    expect(await alertOps('otp_phone_limit_misconfigured', 'b')).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('tipos distintos no se tapan entre sí', async () => {
    const send = vi.fn(async () => {})
    const alertOps = createAlertOps({ send, now: () => 0 })
    await alertOps('otp_phone_limit_misconfigured', 'a')
    expect(await alertOps('otro_tipo', 'b')).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('si el envío falla, no lanza y no consume la ventana', async () => {
    const send = vi
      .fn<(k: string, d: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('push caído'))
      .mockResolvedValue(undefined)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const alertOps = createAlertOps({ send, now: () => 0 })
    expect(await alertOps('k', 'd')).toBe(false)
    expect(await alertOps('k', 'd')).toBe(true)
    err.mockRestore()
  })

  it('llamadas simultáneas del mismo tipo mandan una sola', async () => {
    const send = vi.fn(async () => {})
    const alertOps = createAlertOps({ send, now: () => 0 })
    await Promise.all([alertOps('k', 'd'), alertOps('k', 'd'), alertOps('k', 'd')])
    expect(send).toHaveBeenCalledTimes(1)
  })
})
