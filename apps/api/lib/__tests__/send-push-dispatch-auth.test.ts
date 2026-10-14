import { describe, expect, it } from 'vitest'
import {
  DISPATCH_EXEMPT_EVENTS,
  DISPATCH_SECRET_HEADER,
  isDispatchCaller,
  needsDispatchSecret,
} from '../../../../supabase/functions/send-push/dispatch-auth.ts'

const SECRET = 'secreto-de-despacho-0123456789abcdef'

describe('send-push · isDispatchCaller (solo el trigger de la base despacha)', () => {
  it('acepta solo el secreto exacto', () => {
    expect(isDispatchCaller(SECRET, SECRET)).toBe(true)
  })

  it('rechaza sin cabecera, vacía, distinta, prefijo, con espacios y la clave anónima', () => {
    expect(isDispatchCaller(null, SECRET)).toBe(false)
    expect(isDispatchCaller('', SECRET)).toBe(false)
    expect(isDispatchCaller('otro', SECRET)).toBe(false)
    expect(isDispatchCaller(SECRET.slice(0, -1), SECRET)).toBe(false)
    expect(isDispatchCaller(`${SECRET} `, SECRET)).toBe(false)
    expect(isDispatchCaller('Bearer eyJhbGciOiJIUzI1NiJ9.anon', SECRET)).toBe(false)
  })

  it('sin secreto configurado en la función rechaza TODO (falla cerrado), incluso un vacío', () => {
    expect(isDispatchCaller('', '')).toBe(false)
    expect(isDispatchCaller('x', '')).toBe(false)
    expect(isDispatchCaller(null, undefined)).toBe(false)
    expect(isDispatchCaller(SECRET, undefined)).toBe(false)
  })

  it('la cabecera tiene un nombre fijo en minúsculas', () => {
    expect(DISPATCH_SECRET_HEADER).toBe('x-push-dispatch-secret')
  })
})

describe('send-push · needsDispatchSecret (qué eventos exigen el secreto de despacho)', () => {
  it.each([
    'OrderStatusChanged',
    'OrderCreated',
    'CashDelivered',
    'CourierStepped',
    '',
    'constructor',
    '__proto__',
  ])('«%s» exige el secreto de despacho', (ev) => {
    expect(needsDispatchSecret(ev)).toBe(true)
  })

  it('un event_type que no es texto también lo exige', () => {
    expect(needsDispatchSecret(undefined)).toBe(true)
    expect(needsDispatchSecret({})).toBe(true)
  })

  it('OpsAlert tiene su propio secreto (x-ops-alert-secret) y es la única excepción', () => {
    expect(DISPATCH_EXEMPT_EVENTS).toEqual(['OpsAlert'])
    expect(needsDispatchSecret('OpsAlert')).toBe(false)
  })
})
