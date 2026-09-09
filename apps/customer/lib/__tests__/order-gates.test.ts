import { describe, expect, it } from 'vitest'
import { type GateInputs, missingGates } from '../order-gates'

/**
 * Base: un cliente COMPLETO pidiendo delivery. Cada test rompe una cosa.
 *
 * Se parte de lo válido y no de lo vacío a propósito: la regla que se estrenó
 * aquí —el recojo no pide domicilio— solo se ve rompiendo UNA condición, y con
 * un objeto vacío por defecto cada test tendría que rellenar las otras cuatro y
 * el contraste se perdería entre el ruido.
 */
function inputs(overrides: Partial<GateInputs> = {}): GateInputs {
  return {
    isAuthenticated: true,
    phoneVerified: true,
    hasValidAddress: true,
    isPaymentBlocked: false,
    deliveryMethod: 'delivery',
    ...overrides,
  }
}

describe('missingGates · sin sesión', () => {
  it('solo pide cuenta, aunque le falte todo lo demás', () => {
    // Sin sesión no se ha podido consultar NADA del perfil, así que anunciar
    // «te falta el celular» sería inventarse un dato que nadie leyó.
    const gates = missingGates(
      inputs({
        isAuthenticated: false,
        phoneVerified: false,
        hasValidAddress: false,
        isPaymentBlocked: true,
      }),
    )
    expect(gates).toEqual(['auth'])
  })

  it('pide cuenta también en recojo', () => {
    expect(missingGates(inputs({ isAuthenticated: false, deliveryMethod: 'pickup' }))).toEqual([
      'auth',
    ])
  })
})

describe('missingGates · celular', () => {
  it('lo pide en delivery', () => {
    expect(missingGates(inputs({ phoneVerified: false }))).toContain('phone')
  })

  it('LO PIDE TAMBIÉN EN RECOJO', () => {
    // No es simetría por gusto: el strike del `pickup_no_show` (0220) se ancla
    // SOLO por teléfono —en un recojo no hay domicilio ni coordenadas— y la
    // cajera necesita un número al que llamar. Es el único paso del registro
    // que el recojo no puede saltarse.
    expect(missingGates(inputs({ phoneVerified: false, deliveryMethod: 'pickup' }))).toContain(
      'phone',
    )
  })
})

describe('missingGates · domicilio', () => {
  it('lo pide en delivery cuando no hay dirección en zona', () => {
    expect(missingGates(inputs({ hasValidAddress: false }))).toContain('address')
  })

  it('NO lo pide en recojo', () => {
    // La regla que este módulo existe para sostener. Un pedido de mostrador no
    // tiene domicilio: `delivery_reference` y las coordenadas van NULL.
    expect(
      missingGates(inputs({ hasValidAddress: false, deliveryMethod: 'pickup' })),
    ).not.toContain('address')
  })

  it('en recojo, sin dirección y con todo lo demás en regla, no falta nada', () => {
    expect(missingGates(inputs({ hasValidAddress: false, deliveryMethod: 'pickup' }))).toEqual([])
  })

  it('en recojo tampoco lo pide quien vive FUERA de la zona de reparto', () => {
    // `hasValidAddress` es false tanto para «no tengo dirección» como para
    // «mi casa cae fuera del polígono». El segundo es quien vive en un caserío
    // y baja al pueblo: hoy no podía pedir NADA, y el recojo es su único canal.
    expect(missingGates(inputs({ hasValidAddress: false, deliveryMethod: 'pickup' }))).toEqual([])
  })
})

describe('missingGates · pago sin resolver', () => {
  it('bloquea en delivery', () => {
    expect(missingGates(inputs({ isPaymentBlocked: true }))).toContain('pending_payment_resolution')
  })

  it('BLOQUEA TAMBIÉN EN RECOJO', () => {
    // Una captura rechazada sin resolver es una deuda con el negocio, y el
    // mostrador no la perdona: cambiar de canal no puede ser la vía de escape.
    expect(missingGates(inputs({ isPaymentBlocked: true, deliveryMethod: 'pickup' }))).toContain(
      'pending_payment_resolution',
    )
  })
})

describe('missingGates · orden', () => {
  it('el celular va antes que el domicilio', () => {
    // El orden es el del recorrido, no el de la importancia: quien llama a esto
    // enseña `missingGates[0]` como el siguiente paso, y pedir el mapa antes que
    // el número invertiría el onboarding.
    expect(missingGates(inputs({ phoneVerified: false, hasValidAddress: false }))).toEqual([
      'phone',
      'address',
    ])
  })

  it('acumula los tres cuando faltan los tres', () => {
    expect(
      missingGates(
        inputs({ phoneVerified: false, hasValidAddress: false, isPaymentBlocked: true }),
      ),
    ).toEqual(['phone', 'address', 'pending_payment_resolution'])
  })

  it('en recojo, el mismo caso se queda en dos', () => {
    expect(
      missingGates(
        inputs({
          phoneVerified: false,
          hasValidAddress: false,
          isPaymentBlocked: true,
          deliveryMethod: 'pickup',
        }),
      ),
    ).toEqual(['phone', 'pending_payment_resolution'])
  })
})

describe('missingGates · cliente completo', () => {
  it('no falta nada en delivery', () => {
    expect(missingGates(inputs())).toEqual([])
  })

  it('no falta nada en recojo', () => {
    expect(missingGates(inputs({ deliveryMethod: 'pickup' }))).toEqual([])
  })
})
