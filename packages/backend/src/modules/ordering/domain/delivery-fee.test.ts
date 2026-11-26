import { describe, expect, it } from 'vitest'
import { cents, isPlainNumber, nominalDeliveryFee } from './delivery-fee'

describe('cents', () => {
  it('pasa soles a céntimos enteros sin error de coma flotante', () => {
    expect(cents(48)).toBe(4800)
    expect(cents(0.1 + 0.2)).toBe(30)
    expect(cents(47.99)).toBe(4799)
  })
})

describe('isPlainNumber (solo un número JSON finito ordinario habilita un 403)', () => {
  it.each([[0], [2.5], [80], [-1], [1e21]])('%s es un número ordinario', (v) => {
    expect(isPlainNumber(v)).toBe(true)
  })
  it.each([
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY],
    ['80'],
    ['2.50'],
    [' 2.5 '],
    ['1e3'],
    ['1e309'],
    ['NaN'],
    ['Infinity'],
    [''],
    ['abc'],
    ['0x10'],
    ['1,5'],
    [true],
    [false],
    [null],
    [undefined],
    [{}],
    [[2]],
  ])('%s no lo es', (v) => {
    expect(isPlainNumber(v)).toBe(false)
  })
})

describe('nominalDeliveryFee', () => {
  const bands = { near: 2, far: 2.5 }
  const ok = (c: number) => ({ cents: c, reliable: true })

  it('usa la tarifa de la banda', () => {
    expect(nominalDeliveryFee('near', bands, 3)).toEqual(ok(200))
    expect(nominalDeliveryFee('far', bands, 3)).toEqual(ok(250))
  })

  it('una tarifa de banda numérica escrita como cadena se PINTA igual que antes, pero no es fiable', () => {
    // La cotización conserva sus céntimos; la guardia de la creación no rechaza con ella.
    expect(nominalDeliveryFee('near', { near: '2.50' }, 3)).toEqual({ cents: 250, reliable: false })
    expect(nominalDeliveryFee('near', { near: ' 2.5 ' }, 3)).toEqual({
      cents: 250,
      reliable: false,
    })
  })

  it('sin tarifa en la banda (clave ausente o null) usa la del negocio, y es fiable', () => {
    expect(nominalDeliveryFee('far', { near: 2 }, 3.5)).toEqual(ok(350))
    expect(nominalDeliveryFee('near', { near: null }, 3)).toEqual(ok(300))
    expect(nominalDeliveryFee('near', null, 3)).toEqual(ok(300))
    expect(nominalDeliveryFee('near', undefined, 3)).toEqual(ok(300))
  })

  it('sin banda ni tarifa del negocio cae a S/ 2.00', () => {
    expect(nominalDeliveryFee('near', {}, null)).toEqual(ok(200))
    expect(nominalDeliveryFee('far', undefined, null)).toEqual(ok(200))
  })

  it('una tarifa de banda en cero es una tarifa, no una ausencia', () => {
    expect(nominalDeliveryFee('near', { near: 0 }, 3)).toEqual(ok(0))
  })

  describe('CAX-006: una tarifa presente pero que no es un número ordinario NO es fiable', () => {
    it.each([
      ['texto', 'abc'],
      ['cadena vacía (SQL: ::numeric falla)', ''],
      ['solo espacios', '  '],
      ['booleano', true],
      ['Infinity como cadena', 'Infinity'],
      ['NaN como cadena', 'NaN'],
      ['cadena que desborda JavaScript pero no SQL', '1e309'],
      ['número JSON que desborda JavaScript (Infinity)', Number.POSITIVE_INFINITY],
      ['NaN', Number.NaN],
      ['hexadecimal', '0x10'],
      ['coma decimal', '1,5'],
      ['objeto', {}],
    ])('%s: usa el respaldo para pintar y queda reliable false', (_n, valor) => {
      expect(nominalDeliveryFee('near', { near: valor }, 3)).toEqual({
        cents: 300,
        reliable: false,
      })
    })

    it('la otra banda no afecta: far válida con near inválida', () => {
      expect(nominalDeliveryFee('far', { near: 'abc', far: 2.5 }, 3)).toEqual(ok(250))
    })

    it('delivery_bands que no es un objeto (texto, número, arreglo)', () => {
      expect(nominalDeliveryFee('near', 'abc', 3)).toEqual({ cents: 300, reliable: false })
      expect(nominalDeliveryFee('near', 7, 3)).toEqual({ cents: 300, reliable: false })
      expect(nominalDeliveryFee('near', [2], 3)).toEqual({ cents: 300, reliable: false })
    })
  })

  describe('la tarifa del negocio (respaldo) también debe ser un número ordinario', () => {
    it('un número finito es fiable; ausente o null cae a S/ 2.00 y es fiable', () => {
      expect(nominalDeliveryFee('near', {}, 3.5)).toEqual(ok(350))
      expect(nominalDeliveryFee('near', {}, null)).toEqual(ok(200))
    })
    it.each([
      ['cadena numérica (se pinta igual)', '3.50', 350],
      ['cadena que desborda', '1e309', 200],
      ['Infinity', Number.POSITIVE_INFINITY, 200],
      ['NaN', Number.NaN, 200],
    ])('%s: no es fiable y los céntimos son siempre finitos', (_n, valor, esperado) => {
      const r = nominalDeliveryFee('near', {}, valor as number | string)
      expect(r).toEqual({ cents: esperado, reliable: false })
      expect(Number.isFinite(r.cents)).toBe(true)
    })
  })
})
