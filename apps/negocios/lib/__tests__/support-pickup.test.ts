import { describe, expect, it } from 'vitest'
import { customerWhatsappDigits, pickupReadyMessage } from '../support'

/**
 * El aviso de WhatsApp al cliente. (Migración 0221)
 *
 * Es el mensaje que sustituye al push cuando el push no llega — que en el
 * piloto es la mayoría de las veces. Lo lee un desconocido para su agenda,
 * probablemente en la calle, y tiene que bastarse solo.
 */

describe('customerWhatsappDigits · a quién se le escribe', () => {
  /**
   * `orders.customer_phone` guarda NUEVE dígitos en el canal web, pero el
   * manual de la cajera ha guardado E.164 en el pasado. Las dos formas son
   * datos reales de la misma columna.
   */
  it('acepta las dos formas en que vive el teléfono en la columna', () => {
    expect(customerWhatsappDigits('987654321')).toBe('51987654321')
    expect(customerWhatsappDigits('+51987654321')).toBe('51987654321')
    expect(customerWhatsappDigits('51 987 654 321')).toBe('51987654321')
  })

  /**
   * `null` NO es un detalle: es lo que hace que la UI enseñe el estado
   * alternativo en vez de un botón que abre un chat con nadie. Mismo criterio
   * que `normalizeSupportPhone`, que existe por un fallback hardcodeado que
   * abría WhatsApp igual con la configuración rota.
   */
  it('devuelve null cuando no hay a quién escribir', () => {
    expect(customerWhatsappDigits(null)).toBeNull()
    expect(customerWhatsappDigits('')).toBeNull()
    expect(customerWhatsappDigits('123')).toBeNull()
    // Fijo de Áncash: es un teléfono, pero no tiene WhatsApp.
    expect(customerWhatsappDigits('043321456')).toBeNull()
  })
})

describe('pickupReadyMessage · qué se le dice', () => {
  const base = { bizName: 'La Florencia', shortId: 'ABCD2345', customerName: 'Rosa Quispe' }

  /**
   * DICE QUIÉN ESCRIBE, Y VA PRIMERO. Sin eso es un número desconocido
   * mandándote a un sitio, y eso no se abre: se ignora o se bloquea.
   */
  it('se presenta antes de pedir nada', () => {
    const msg = pickupReadyMessage({ ...base, totalACobrar: 24 })
    expect(msg.split('\n')[0]).toBe('Hola Rosa, soy La Florencia.')
  })

  it('solo el nombre de pila, y sigue funcionando sin nombre', () => {
    expect(pickupReadyMessage({ ...base, totalACobrar: null })).toContain('Hola Rosa,')
    expect(
      pickupReadyMessage({ ...base, customerName: null, totalACobrar: null }).split('\n')[0],
    ).toBe('Hola, soy La Florencia.')
  })

  it('lleva el código para que ella lo empareje en el mostrador', () => {
    expect(pickupReadyMessage({ ...base, totalACobrar: 24 })).toContain('#ABCD2345')
  })

  /**
   * EL MONTO SOLO SI HAY ALGO QUE COBRAR. En un prepago ya está pagado, y
   * recordarle la cifra es la invitación a que la pague dos veces — la misma
   * regla que `motorizados` aplica a su tarjeta.
   */
  it('dice cuánto pagar cuando se cobra en el mostrador', () => {
    expect(pickupReadyMessage({ ...base, totalACobrar: 24 })).toContain('S/ 24.00')
  })

  it('NO menciona dinero en un pedido ya pagado', () => {
    const msg = pickupReadyMessage({ ...base, totalACobrar: null })
    expect(msg).not.toMatch(/S\//)
    expect(msg).not.toMatch(/pagas/)
  })

  /**
   * NO PROMETE PLAZOS. «Te lo guardamos 20 minutos» sería un compromiso que
   * nadie decidió: el mostrador no autocancela nada solo (0220), y quien decide
   * si el cliente no vino es la cajera.
   */
  it('no promete cuánto tiempo se le guarda', () => {
    const msg = pickupReadyMessage({ ...base, totalACobrar: 24 })
    expect(msg).not.toMatch(/\d+\s*min/)
  })
})
