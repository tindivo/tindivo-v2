import { describe, expect, it } from 'vitest'
import { gpsFailureOutcome } from '@/features/checkout/lib/gps-failure'

/**
 * Qué se hace cuando leer el GPS falla (permiso negado, sin señal, timeout).
 * Regla de negocio: negar el GPS o no tenerlo nunca impide pedir a quien ya
 * tiene compra previa; sin compra previa y sin GPS, prepago.
 */
describe('gpsFailureOutcome', () => {
  it('prepago: no hace falta GPS', () => {
    expect(
      gpsFailureOutcome({
        selectedPayment: 'prepaid',
        recojoPresencial: false,
        hasDeliveryHistory: false,
      }),
    ).toEqual({ payload: { method: 'manual_skip_prepaid' } })
  })

  it('recojo presencial: registra el fallo y sigue', () => {
    expect(
      gpsFailureOutcome({
        selectedPayment: 'pending_cash',
        recojoPresencial: true,
        hasDeliveryHistory: false,
      }),
    ).toEqual({ payload: { method: 'failed' } })
  })

  it('con compra previa y pago al recibir: no bloquea, decide el servidor', () => {
    for (const selectedPayment of ['pending_cash', 'pending_yape'] as const) {
      expect(
        gpsFailureOutcome({ selectedPayment, recojoPresencial: false, hasDeliveryHistory: true }),
      ).toEqual({ payload: { method: 'failed' } })
    }
  })

  it('sin compra previa y pago al recibir: hoja de reintentar o prepago', () => {
    expect(
      gpsFailureOutcome({
        selectedPayment: 'pending_cash',
        recojoPresencial: false,
        hasDeliveryHistory: false,
      }),
    ).toEqual({ issue: 'unavailable' })
  })
})
