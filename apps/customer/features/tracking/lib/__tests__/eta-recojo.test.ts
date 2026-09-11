import { describe, expect, it } from 'vitest'
import type { Tracking } from '../../types'
import { cancelledCopy, etaLabel, etaView, getStatusMessage } from '../format'

/**
 * CUÁNTO FALTA, CUANDO NADIE VIAJA.
 *
 * `etaView` calcula `estimated_ready_at + trayecto`, y el trayecto es el de una
 * moto. En un recojo esa moto no existe: el que se mueve es el cliente, y el
 * pedido no se mueve nunca. El resultado era un número inflado durante TODO el
 * ciclo —25–30 min para comida que salía en 5— que al final se volvía una
 * contradicción visible: «Listo para recoger» y «Llega en 20–25 min» en la
 * misma caja del hero.
 *
 * POR QUÉ NADIE LO VIO ANTES. La `0220` sí adaptó al recojo todo lo que habla
 * de ESTADOS —`stepsFor`, `getStatusMessage`, `alertFor`— y esta función habla
 * de MINUTOS, así que quedó fuera del barrido. Estas aserciones existen para
 * que el siguiente cambio del ETA tenga que pasar por el recojo.
 */

const BASE: Tracking = {
  shortId: 'ABCD1234',
  orderNumber: 1,
  businessName: 'La Florencia',
  status: 'preparing',
  deliveryMethod: 'pickup',
  paymentIntent: 'pending_cash',
  cancelReason: null,
  estimatedReadyAt: null,
  driverName: null,
  items: [],
  total: 25,
} as unknown as Tracking

/** `now` fijo: el ETA es aritmética sobre relojes y no puede depender del real. */
const AHORA = Date.parse('2026-09-08T20:00:00Z')
const enMinutos = (m: number) => new Date(AHORA + m * 60_000).toISOString()

describe('0224 · el ETA de un recojo no suma el viaje de una moto', () => {
  it('en cocina cuenta hasta que la comida esté, y nada más', () => {
    const recojo = { ...BASE, estimatedReadyAt: enMinutos(12) }

    expect(etaView(recojo, AHORA)).toEqual({ kind: 'range', min: 12, max: 12 })
    expect(etaLabel(recojo, AHORA)).toBe('12 min')
  })

  /**
   * La mitad que da sentido a la otra: si el trayecto se quitara para todos, el
   * delivery empezaría a prometer la hora de COCINA como hora de llegada, que
   * es el defecto que la `0117` vino a arreglar.
   */
  it('el mismo pedido en delivery SÍ suma el trayecto', () => {
    const delivery = {
      ...BASE,
      deliveryMethod: 'delivery',
      estimatedReadyAt: enMinutos(12),
      travelMinutes: { min: 20, max: 25 },
    }

    expect(etaView(delivery, AHORA)).toEqual({ kind: 'range', min: 32, max: 37 })
    expect(etaLabel(delivery, AHORA)).toBe('32–37 min')
  })

  /**
   * EL CASO QUE SE VIO EN PANTALLA. Con la bolsa en el mostrador no hay nada
   * que estimar: el titular ya dice «Listo para recoger» y cualquier número al
   * lado solo puede contradecirlo.
   */
  it('con la bolsa en el mostrador no hay cuenta atrás, hay un hecho', () => {
    const listo = {
      ...BASE,
      status: 'ready_for_pickup',
      // Aunque el reloj de cocina apunte al futuro: el estado manda sobre el
      // sello, porque la cajera puede marcar «lista» antes de tiempo.
      estimatedReadyAt: enMinutos(8),
    }

    expect(etaView(listo, AHORA)).toEqual({ kind: 'ready' })
    expect(etaLabel(listo, AHORA)).toBe('Ya está listo')
  })

  it('un rango de un solo número se dice como un número', () => {
    // «12–12 min» se lee como un fallo de la pantalla, no como una estimación.
    expect(etaLabel({ ...BASE, estimatedReadyAt: enMinutos(7) }, AHORA)).toBe('7 min')
  })

  it('sin reloj de cocción no se inventa nada', () => {
    expect(etaView(BASE, AHORA)).toEqual({ kind: 'none' })
    expect(etaLabel(BASE, AHORA)).toBeNull()
  })
})

/**
 * EL PLANTÓN DE UN RECOJO NO LO PROTAGONIZA UN MOTORIZADO.
 *
 * `pickup_no_show` y el no-show del motorizado comparten `cancel_reason =
 * 'no_show'` a propósito —mismo motivo de negocio, mismos strikes— pero lo que
 * hay que contarle al cliente no se parece en nada. Antes de esto, quien no
 * pasó a recoger su pedido leía que «el motorizado llegó a la dirección y no
 * logró encontrarte»: un relato de algo que nunca ocurrió, sobre un pedido que
 * además ya había pagado.
 */
describe('0224 · qué lee el cliente cuando no pasó a recoger', () => {
  it('no menciona motorizados ni direcciones', () => {
    const c = cancelledCopy('no_show', { deliveryMethod: 'pickup' })

    expect(c.body).not.toContain('motorizado')
    expect(c.body).not.toContain('dirección')
    expect(c.body).toContain('mostrador')
  })

  it('deja abierta la puerta de WhatsApp en vez de cerrar el tema', () => {
    // La política («no se devuelve») ya se le dijo en el checkout, ANTES de
    // pagar, que es donde evita la discusión. Repetirla aquí no impide nada y
    // se lee como una patada a quien acaba de perder su comida.
    const c = cancelledCopy('no_show', { deliveryMethod: 'pickup' })

    expect(c.body).toContain('WhatsApp')
    expect(c.body).not.toContain('no se devuelve')
  })

  it('el delivery conserva su frase, que para él sí es cierta', () => {
    const c = cancelledCopy('no_show', { deliveryMethod: 'delivery' })

    expect(c.body).toContain('El motorizado llegó a la dirección')
  })

  /**
   * Sin método no se adivina. Un `cancelledCopy` llamado sin `opts` —o desde un
   * sitio que todavía no lo pase— tiene que caer en el texto de siempre, no en
   * el del mostrador: inventarle un mostrador a un delivery sería el mismo bug
   * al revés.
   */
  it('sin método declarado, el texto es el del delivery', () => {
    expect(cancelledCopy('no_show').body).toContain('El motorizado llegó a la dirección')
  })
})

/**
 * NO SE LE PIDE DOS VECES UN DINERO QUE YA ENTRÓ.
 *
 * El pie del seguimiento preguntaba por `paymentIntent`, o sea por lo que el
 * cliente PENSABA pagar cuando pidió, y desde la 0224 eso ya no responde si el
 * dinero está dentro: un recojo «ahora» se cobra en la caja AL ACEPTAR, antes
 * de que nadie toque una sartén. Así que a quien pagó su pollo y esperó la
 * cocción entera, la pantalla le decía «pásalo a recoger Y PAGAS AHÍ» justo
 * cuando iba camino del mostrador.
 *
 * Es el mismo defecto —y el mismo arreglo— que el aviso de WhatsApp que manda
 * la cajera desde `negocios`: la pregunta buena es `paymentVerifiedAt`, que
 * significa «alguien confirmó que el dinero llegó».
 */
describe('0224 · el pie del recojo listo y el dinero', () => {
  const listo = (over: Partial<Tracking> = {}) =>
    getStatusMessage({ ...BASE, status: 'ready_for_pickup', ...over } as Tracking, 'ontheway')

  it('no manda a pagar a quien ya pagó en la caja', () => {
    const cobrado = listo({ paymentVerifiedAt: '2026-09-08T19:40:00Z' })

    expect(cobrado).not.toContain('pagas')
    expect(cobrado).toContain('Pásalo a recoger')
  })

  /**
   * La mitad que da sentido a la otra: el recojo MANUAL que la cajera fía a un
   * cliente que conoce por teléfono sí tiene algo que cobrar en el mostrador
   * —el CHECK de la 0223 solo ata al canal del cliente— y callarlo lo dejaría
   * llegando sin plata.
   */
  it('sí lo dice cuando de verdad queda algo que cobrar', () => {
    expect(listo({ paymentVerifiedAt: null })).toContain('pagas ahí')
  })

  /**
   * El prepago sigue teniendo su rama, sumada y no sustituida: su
   * `payment_verified_at` lo escribe `validate_order`, y un recojo manual
   * creado ya prepagado no pasa por ahí.
   */
  it('un prepago no pide dinero ni sin el sello', () => {
    expect(listo({ paymentIntent: 'prepaid', paymentVerifiedAt: null })).not.toContain('pagas')
  })

  /** El delivery no se toca: ahí el que cobra es el motorizado, en la puerta. */
  it('el delivery conserva su aviso de tener el pago listo', () => {
    const d = getStatusMessage(
      { ...BASE, deliveryMethod: 'delivery', status: 'picked_up' } as Tracking,
      'ontheway',
    )

    expect(d).toContain('Ten listo tu pago')
  })
})
