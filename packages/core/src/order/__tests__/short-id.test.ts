import { describe, expect, it } from 'vitest'
import { InvalidShortIdError } from '../../shared/errors'
import { ShortId } from '../short-id'

describe('ShortId', () => {
  it('crea un short_id válido del alfabeto', () => {
    expect(ShortId.create('ABCD2345')).toBe('ABCD2345')
  })

  it('rechaza al CREAR caracteres prohibidos (I, O, 0, 1)', () => {
    expect(() => ShortId.create('ABCDO012')).toThrow(InvalidShortIdError)
    expect(() => ShortId.create('SHORT')).toThrow(InvalidShortIdError) // longitud != 8
    expect(() => ShortId.create('abcd2345')).toThrow(InvalidShortIdError) // minúsculas
  })

  it('REHIDRATA desde persistencia SIN validar (fix del bug v1)', () => {
    // Un short_id legacy con caracteres fuera del alfabeto NO debe romper la lectura.
    expect(() => ShortId.fromTrusted('OLD0LEG1')).not.toThrow()
    expect(ShortId.fromTrusted('OLD0LEG1')).toBe('OLD0LEG1')
  })

  it('isValid refleja el formato', () => {
    expect(ShortId.isValid('ABCD2345')).toBe(true)
    expect(ShortId.isValid('ABCD2340')).toBe(false) // contiene 0
  })
})
