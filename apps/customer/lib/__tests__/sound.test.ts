import { describe, expect, it } from 'vitest'
import { alertFor } from '@/features/tracking/lib/alerts'
import { CUSTOMER_SOUNDS, createAudioTrigger, playCustomerSound } from '@/lib/sound'

describe('customer sounds', () => {
  it('define las rutas correctas a los audios en public/sound', () => {
    expect(CUSTOMER_SOUNDS.orderSubmitted).toBe('/sound/notication-tindivo-2.mp3')
    expect(CUSTOMER_SOUNDS.kitchenBell).toBe('/sound/kitchen-bell.mp3')
  })

  it('no falla al llamarse sin window (SSR)', () => {
    expect(() => playCustomerSound('orderSubmitted')).not.toThrow()
    expect(() => createAudioTrigger('kitchenBell')()).not.toThrow()
  })

  it('asigna kitchenBell al aceptar o empezar preparacion en el restaurante', () => {
    // Cuando el restaurante acepta y empieza a preparar (contraentrega o post-verificación)
    const preparing = alertFor('preparing', false)
    expect(preparing?.sound).toBe('kitchenBell')

    // Cuando el restaurante confirma (contraentrega o pago verificado)
    const confirmed = alertFor('confirmed', false)
    expect(confirmed?.sound).toBe('kitchenBell')

    // Cuando el restaurante confirma en prepago y pasa a esperar pago
    const awaitingPayment = alertFor('awaiting_payment', true)
    expect(awaitingPayment?.sound).toBe('kitchenBell')

    // Otros estados usan los tonos sintéticos estándar
    const ontheway = alertFor('ontheway', false)
    expect(ontheway?.sound).toBeUndefined()

    const delivered = alertFor('delivered', false)
    expect(delivered?.sound).toBeUndefined()
  })
})
