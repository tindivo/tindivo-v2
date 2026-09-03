import { describe, expect, it } from 'vitest'
import {
  frameFallback,
  heirAfterRemoving,
  pickDefaultAddress,
  type StoredLocation,
  sealLocation,
  shouldBecomeDefault,
} from '@/lib/address-record'
import type { AddressValue } from '@/lib/address-validation'

const addr = (id: string, is_default = false) => ({ id, is_default })

describe('pickDefaultAddress', () => {
  it('devuelve la marcada, esté donde esté en la lista', () => {
    expect(pickDefaultAddress([addr('a'), addr('b', true), addr('c')])?.id).toBe('b')
  })

  it('cae a la primera cuando ninguna está marcada', () => {
    // La red: es el estado que dejaba al mensaje de WhatsApp sin dirección.
    expect(pickDefaultAddress([addr('a'), addr('b')])?.id).toBe('a')
  })

  it('devuelve null sin direcciones', () => {
    expect(pickDefaultAddress([])).toBeNull()
  })
})

describe('heirAfterRemoving', () => {
  it('promueve a la superviviente cuando se borra la predeterminada', () => {
    const heir = heirAfterRemoving([addr('a', true), addr('b')], 'a')
    expect(heir?.id).toBe('b')
  })

  it('no toca nada si la que se va no era la predeterminada', () => {
    expect(heirAfterRemoving([addr('a', true), addr('b')], 'b')).toBeNull()
  })

  it('no promueve a nadie si se borra la última', () => {
    expect(heirAfterRemoving([addr('a', true)], 'a')).toBeNull()
  })

  it('cura un usuario que ya estaba sin predeterminada antes del borrado', () => {
    const heir = heirAfterRemoving([addr('a'), addr('b'), addr('c')], 'b')
    expect(heir?.id).toBe('a')
  })

  it('ignora un id que no está en la lista', () => {
    expect(heirAfterRemoving([addr('a', true), addr('b')], 'zzz')).toBeNull()
  })
})

describe('shouldBecomeDefault', () => {
  it('la primera dirección de un usuario manda', () => {
    expect(shouldBecomeDefault([])).toBe(true)
  })

  it('no le roba la predeterminada a la que ya manda', () => {
    // El defecto del alta del onboarding: ponía `is_default: true` a secas y
    // limpiaba las demás, así que pedir con una dirección nueva te cambiaba la
    // de siempre sin avisar.
    expect(shouldBecomeDefault([addr('a', true)])).toBe(false)
    expect(shouldBecomeDefault([addr('a'), addr('b', true)])).toBe(false)
  })

  it('cura al usuario que se quedó sin ninguna marcada', () => {
    expect(shouldBecomeDefault([addr('a'), addr('b')])).toBe(true)
  })
})

describe('frameFallback', () => {
  const casa = {
    id: 'casa',
    is_default: true,
    coordinates_lat: -9.1478,
    coordinates_lng: -78.2762,
    location_confirmed_at: '2026-08-01T00:00:00.000Z',
  }
  const plaza = {
    id: 'plaza',
    is_default: false,
    coordinates_lat: -9.1465,
    coordinates_lng: -78.2779,
    location_confirmed_at: null,
  }

  it('encuadra en la predeterminada confirmada', () => {
    expect(frameFallback([plaza, casa])).toEqual({ lat: -9.1478, lng: -78.2762 })
  })

  it('ignora las direcciones sin confirmar, aunque sean la predeterminada', () => {
    // Las cuatro de la plaza: encuadrar ahí sería volver al problema por la
    // puerta de atrás.
    expect(frameFallback([{ ...plaza, is_default: true }])).toBeNull()
  })

  it('sin direcciones no propone nada, y el mapa cae al centro del pueblo', () => {
    expect(frameFallback([])).toBeNull()
  })

  it('si ninguna confirmada es la predeterminada, sirve la primera confirmada', () => {
    expect(frameFallback([{ ...casa, is_default: false }])).toEqual({
      lat: -9.1478,
      lng: -78.2762,
    })
  })
})

describe('sealLocation', () => {
  const AHORA = '2026-09-02T20:00:00.000Z'
  const AYER = '2026-09-01T10:00:00.000Z'

  const guardada: StoredLocation = {
    coordinates_lat: -9.146789,
    coordinates_lng: -78.277123,
    location_confirmed_at: AYER,
    location_accuracy_m: 8,
  }

  const valor = (over: Partial<AddressValue> = {}): AddressValue => ({
    label: 'Casa',
    line: 'Jr. Sucre 412',
    reference: 'Frente a la bodega de don Carlos',
    coords: { lat: -9.146789, lng: -78.277123 },
    accuracyM: null,
    ...over,
  })

  it('conserva sello y precisión cuando el punto no se movió', () => {
    // El caso que destruía la medida: editar la etiqueta o la referencia sin
    // tocar el mapa. `accuracyM` del formulario entra en null porque el
    // MapPicker no lo rehidrataba, y ese null pisaba los 8 m del sensor.
    expect(sealLocation(guardada, valor(), AHORA)).toEqual({
      location_confirmed_at: AYER,
      location_accuracy_m: 8,
    })
  })

  it('resella cuando el punto se movió, con la precisión nueva', () => {
    const movido = valor({ coords: { lat: -9.1471, lng: -78.2775 }, accuracyM: 12 })
    expect(sealLocation(guardada, movido, AHORA)).toEqual({
      location_confirmed_at: AHORA,
      location_accuracy_m: 12,
    })
  })

  it('un ajuste a mano borra la precisión, porque ya no hay medida', () => {
    const aMano = valor({ coords: { lat: -9.1471, lng: -78.2775 }, accuracyM: null })
    expect(sealLocation(guardada, aMano, AHORA)).toEqual({
      location_confirmed_at: AHORA,
      location_accuracy_m: null,
    })
  })

  it('sella ahora en un alta (no hay fila previa)', () => {
    expect(sealLocation(null, valor({ accuracyM: 15 }), AHORA)).toEqual({
      location_confirmed_at: AHORA,
      location_accuracy_m: 15,
    })
  })

  it('sella ahora sobre una dirección sin confirmar, aunque traiga coordenada', () => {
    // Las tres filas de la 0202: tienen la plaza dentro, pero no la eligió
    // nadie. Rehidratar ese punto sería sellarlo como bueno.
    const plaza: StoredLocation = {
      coordinates_lat: -9.1465,
      coordinates_lng: -78.2779,
      location_confirmed_at: null,
      location_accuracy_m: null,
    }
    expect(sealLocation(plaza, valor({ accuracyM: 9 }), AHORA)).toEqual({
      location_confirmed_at: AHORA,
      location_accuracy_m: 9,
    })
  })

  it('sin punto no sella nada: no hay confirmación que inventar', () => {
    expect(sealLocation(null, valor({ coords: null, accuracyM: 30 }), AHORA)).toEqual({
      location_confirmed_at: null,
      location_accuracy_m: null,
    })
  })

  it('no confunde una coordenada ausente con el meridiano cero', () => {
    const sinPunto: StoredLocation = {
      coordinates_lat: null,
      coordinates_lng: null,
      location_confirmed_at: AYER,
      location_accuracy_m: 5,
    }
    const enCero = valor({ coords: { lat: 0, lng: 0 }, accuracyM: 20 })
    expect(sealLocation(sinPunto, enCero, AHORA)).toEqual({
      location_confirmed_at: AHORA,
      location_accuracy_m: 20,
    })
  })
})
