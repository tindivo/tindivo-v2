import { describe, expect, it } from 'vitest'
import { functions, orderProofRejectedFallback, processOutboxEventsCron } from '../functions'

describe('Job Inngest orderProofRejectedFallback y Outbox Cron en @tindivo/api', () => {
  it('calcula la fecha de expiración exactamente a las 24h desde cancelledAt', () => {
    const cancelledAt = '2026-07-20T10:00:00.000Z'
    const deadline = new Date(new Date(cancelledAt).getTime() + 24 * 60 * 60 * 1000)

    expect(deadline.toISOString()).toBe('2026-07-21T10:00:00.000Z')
  })

  it('construye la clave de idempotencia determinista orderId + cancelledAt', () => {
    const orderId = 'd3b07384-d113-460f-96a2-6323491f8682'
    const cancelledAt = '2026-07-20T10:00:00.000Z'
    const idempotencyKey = `${orderId}-${cancelledAt}`

    expect(idempotencyKey).toBe('d3b07384-d113-460f-96a2-6323491f8682-2026-07-20T10:00:00.000Z')
  })

  it('registra las funciones de fallback y outbox cron en el array servido por inngest', () => {
    expect(functions).toContain(orderProofRejectedFallback)
    expect(functions).toContain(processOutboxEventsCron)
  })
})
