import { describe, expect, it } from 'vitest'
import type { Tracking } from '@/features/tracking/types'
import { activeDeadline, countdownView } from '../deadline'

/**
 * `activeDeadline` decide qué contador ve el cliente, y **tiene que coincidir
 * con lo que cancela de verdad en la base**: `cancel_expired_prepay_orders()`,
 * que desde la `0174` es la única que cancela por tiempo (5 min de aceptación,
 * 15 de pago, 5 de validación humana, 10 de comprobante).
 *
 * El riesgo aquí no es que el contador se vea feo. Es que prometa tiempo que la
 * base no da: el cliente vería 12:30 sobre un pedido que ya está cancelado, y
 * al recargar se encontraría con que lo perdió mientras miraba el reloj.
 *
 * Los minutos llegan de `app_settings.timers` (0172). Los tests los pasan
 * explícitos para no depender de los fallbacks, y hay un caso que comprueba que
 * los fallbacks siguen siendo los mismos números.
 */

const T0 = Date.parse('2026-08-20T20:00:00.000Z')

function pedido(p: Partial<Tracking>): Tracking {
  return { paymentIntent: 'pending_cash', ...p } as Tracking
}

describe('activeDeadline', () => {
  describe('pending_acceptance · los 5 minutos del negocio', () => {
    it('cuenta desde pendingAcceptanceAt', () => {
      const d = activeDeadline(
        pedido({
          status: 'pending_acceptance',
          pendingAcceptanceAt: '2026-08-20T20:00:00.000Z',
          acceptanceMinutes: 5,
        }),
      )
      expect(d).toEqual({ kind: 'acceptance', at: T0 + 5 * 60_000, totalMs: 5 * 60_000 })
    })

    it('NO usa createdAt cuando hay pendingAcceptanceAt', () => {
      // Un pedido que pasó antes por `validando` lleva entre las dos marcas los
      // minutos enteros que tardó la cajera en validarlo. Contar desde
      // `createdAt` le restaría ese tiempo a la ventana del negocio y el
      // contador llegaría a cero con el pedido todavía vivo.
      const d = activeDeadline(
        pedido({
          status: 'pending_acceptance',
          createdAt: '2026-08-20T19:52:00.000Z',
          pendingAcceptanceAt: '2026-08-20T20:00:00.000Z',
          acceptanceMinutes: 5,
        }),
      )
      expect(d?.at).toBe(T0 + 5 * 60_000)
    })

    it('cae a createdAt solo si no hay pendingAcceptanceAt', () => {
      // Es lo que hace el bloque 1 de `cancel_expired_prepay_orders`, que
      // también admite `pending_acceptance_at IS NULL` y mide desde `created_at`.
      const d = activeDeadline(
        pedido({
          status: 'pending_acceptance',
          createdAt: '2026-08-20T20:00:00.000Z',
          acceptanceMinutes: 5,
        }),
      )
      expect(d?.at).toBe(T0 + 5 * 60_000)
    })

    it('aplica igual al prepago: también nace en pending_acceptance', () => {
      const d = activeDeadline(
        pedido({
          status: 'pending_acceptance',
          paymentIntent: 'prepaid',
          pendingAcceptanceAt: '2026-08-20T20:00:00.000Z',
          acceptanceMinutes: 5,
        }),
      )
      // El cron no filtra por `payment_intent`, así que el contador tampoco.
      expect(d?.kind).toBe('acceptance')
    })
  })

  describe('awaiting_payment · los 15 minutos del cliente', () => {
    it('son 15, no los 10 de la validación', () => {
      const d = activeDeadline(
        pedido({
          status: 'awaiting_payment',
          paymentIntent: 'prepaid',
          awaitingPaymentAt: '2026-08-20T20:00:00.000Z',
          paymentMinutes: 15,
          prepayVerificationMinutes: 10,
        }),
      )
      expect(d).toEqual({ kind: 'payment', at: T0 + 15 * 60_000, totalMs: 15 * 60_000 })
    })
  })

  describe('validando · los 10 minutos de la cajera', () => {
    it('cuenta desde validatingAt cuando hay comprobante subido', () => {
      const d = activeDeadline(
        pedido({
          status: 'validando',
          paymentIntent: 'prepaid',
          proofUrl: 'proofs/x.jpg',
          validatingAt: '2026-08-20T20:00:00.000Z',
          prepayVerificationMinutes: 10,
        }),
      )
      expect(d).toEqual({ kind: 'verification', at: T0 + 10 * 60_000, totalMs: 10 * 60_000 })
    })

    it('calla en la validación por llamada de contraentrega', () => {
      // Tiene 5 min en la base, pero el cliente no puede hacer nada con ese
      // número: es angustia sin salida.
      expect(
        activeDeadline(pedido({ status: 'validando', validatingAt: '2026-08-20T20:00:00.000Z' })),
      ).toBeNull()
    })

    it('calla en un prepago sin comprobante', () => {
      expect(
        activeDeadline(
          pedido({
            status: 'validando',
            paymentIntent: 'prepaid',
            validatingAt: '2026-08-20T20:00:00.000Z',
          }),
        ),
      ).toBeNull()
    })
  })

  describe('estados sin plazo', () => {
    it.each(['confirmed', 'preparing', 'ontheway', 'delivered', 'cancelled'])('%s', (status) => {
      expect(activeDeadline(pedido({ status, createdAt: '2026-08-20T20:00:00.000Z' }))).toBeNull()
    })
  })

  describe('datos incompletos', () => {
    it('sin ninguna marca de tiempo no inventa un plazo', () => {
      expect(activeDeadline(pedido({ status: 'pending_acceptance' }))).toBeNull()
    })

    it('con una fecha ilegible tampoco', () => {
      expect(
        activeDeadline(pedido({ status: 'pending_acceptance', pendingAcceptanceAt: 'ayer' })),
      ).toBeNull()
    })
  })

  describe('fallbacks', () => {
    it('valen 5, 15 y 10 si la respuesta no trae los minutos', () => {
      // Una respuesta vieja en caché no debe cambiar el plazo que se enseña.
      const base = '2026-08-20T20:00:00.000Z'
      expect(
        activeDeadline(pedido({ status: 'pending_acceptance', pendingAcceptanceAt: base }))
          ?.totalMs,
      ).toBe(5 * 60_000)
      expect(
        activeDeadline(
          pedido({ status: 'awaiting_payment', paymentIntent: 'prepaid', awaitingPaymentAt: base }),
        )?.totalMs,
      ).toBe(15 * 60_000)
      expect(
        activeDeadline(
          pedido({
            status: 'validando',
            paymentIntent: 'prepaid',
            proofUrl: 'x',
            validatingAt: base,
          }),
        )?.totalMs,
      ).toBe(10 * 60_000)
    })
  })
})

describe('countdownView', () => {
  const cinco = { kind: 'acceptance', at: T0 + 5 * 60_000, totalMs: 5 * 60_000 } as const

  it('pinta mm:ss con los segundos rellenados', () => {
    expect(countdownView(cinco, T0 + 4 * 60_000 - 3_000).label).toBe('1:03')
    expect(countdownView(cinco, T0 + 4 * 60_000 + 55_000).label).toBe('0:05')
  })

  it('no se pone rojo al principio', () => {
    const v = countdownView(cinco, T0)
    expect(v.kind === 'running' && v.urgent).toBe(false)
  })

  it('se pone rojo en el último tercio', () => {
    const v = countdownView(cinco, T0 + 4 * 60_000)
    expect(v.kind === 'running' && v.urgent).toBe(true)
  })

  it('el rojo llega como muy pronto a los 3 minutos, aunque la ventana sea larga', () => {
    // Con 15 min, un tercio serían 5. Cinco minutos en rojo es alarma de fondo,
    // y una alarma que suena siempre deja de significar algo.
    const quince = { kind: 'payment', at: T0 + 15 * 60_000, totalMs: 15 * 60_000 } as const
    const aCuatro = countdownView(quince, T0 + 11 * 60_000)
    const aDos = countdownView(quince, T0 + 13 * 60_000)
    expect(aCuatro.kind === 'running' && aCuatro.urgent).toBe(false)
    expect(aDos.kind === 'running' && aDos.urgent).toBe(true)
  })

  it('vencido dice qué pasa en vez de congelarse en 0:00', () => {
    // Los crons corren cada minuto: hay hasta 60s entre que el plazo vence y la
    // base reacciona. Un `0:00` quieto durante ese minuto parece la app colgada.
    expect(countdownView(cinco, T0 + 5 * 60_000)).toEqual({
      kind: 'grace',
      label: 'Confirmando…',
    })
    expect(countdownView(cinco, T0 + 9 * 60_000).kind).toBe('grace')
  })

  it('cada plazo vencido explica lo suyo', () => {
    expect(countdownView({ kind: 'payment', at: T0, totalMs: 15 * 60_000 }, T0 + 1).label).toBe(
      'Procesando…',
    )
    expect(
      countdownView({ kind: 'verification', at: T0, totalMs: 10 * 60_000 }, T0 + 1).label,
    ).toBe('Revisando…')
  })
})
