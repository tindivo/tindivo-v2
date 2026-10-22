import { describe, expect, it } from 'vitest'
import { isOpsCaller } from '../../../../supabase/functions/send-push/ops-alert.ts'
import { asRecord, classifyRequest } from '../../../../supabase/functions/send-push/request-kind.ts'

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b'

describe('send-push · classifyRequest (selección excluyente del origen)', () => {
  it('OpsAlert exacto va a la rama de la API, tenga o no event_id', () => {
    expect(classifyRequest({ event_type: 'OpsAlert', payload: { kind: 'x' } })).toEqual({
      kind: 'ops',
    })
    expect(classifyRequest({ event_type: 'OpsAlert', event_id: ID })).toEqual({ kind: 'ops' })
  })

  it.each([
    'opsalert',
    'OPSALERT',
    'OpsAlert ',
    ' OpsAlert',
    'opsAlert',
  ])('la variante «%s» NO es la rama de la API: exige event_id', (ev) => {
    expect(classifyRequest({ event_type: ev })).toEqual({ kind: 'invalid' })
    expect(classifyRequest({ event_type: ev, event_id: ID })).toEqual({
      kind: 'event',
      eventId: ID,
    })
  })

  it('un evento normal con event_id UUID se reclama por ese id (en minúsculas)', () => {
    expect(classifyRequest({ event_type: 'OrderCreated', event_id: ID.toUpperCase() })).toEqual({
      kind: 'event',
      eventId: ID,
    })
  })

  it('sin event_id, o que no es UUID, es inválido (los campos del cuerpo no cuentan)', () => {
    const base = { event_type: 'OrderStatusChanged', aggregate_id: ID, payload: {} }
    expect(classifyRequest(base)).toEqual({ kind: 'invalid' })
    for (const bad of ['', 'abc', `${ID}x`, 123, null, {}, [ID]]) {
      expect(classifyRequest({ ...base, event_id: bad })).toEqual({ kind: 'invalid' })
    }
  })

  it('un cuerpo que no es objeto es inválido', () => {
    for (const bad of [null, undefined, 'x', 1, [], [{ event_id: ID }]]) {
      expect(classifyRequest(bad)).toEqual({ kind: 'invalid' })
    }
  })

  it('el secreto de OpsAlert sigue siendo estricto y falla cerrado sin configuración', () => {
    expect(isOpsCaller('s', 's')).toBe(true)
    expect(isOpsCaller('s', 't')).toBe(false)
    expect(isOpsCaller('s', undefined)).toBe(false)
  })
})

describe('send-push · asRecord', () => {
  it('devuelve el objeto tal cual', () => {
    const o = { kind: 'x' }
    expect(asRecord(o)).toBe(o)
  })

  it.each([null, [], [1], 'texto', 7, undefined, true])('%j da {}', (v) => {
    expect(asRecord(v)).toEqual({})
  })
})
