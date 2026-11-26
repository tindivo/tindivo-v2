import { describe, expect, it } from 'vitest'
import {
  cents,
  isExactCentsText,
  isMoneyNumber,
  isPlainNumber,
  nominalDeliveryFee,
} from './delivery-fee'

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

describe('isMoneyNumber (cabe en numeric(10,2) y sin fracción de céntimo)', () => {
  it.each([[0], [2], [2.5], [64.08], [80], [99999999.99]])('%s sí', (v) => {
    expect(isMoneyNumber(v)).toBe(true)
  })
  it.each([
    [0.005],
    [64.085],
    [1e8],
    [1e308],
    [-1e8],
    [Number.NaN],
    ['2.5'],
    [null],
  ])('%s no', (v) => {
    expect(isMoneyNumber(v)).toBe(false)
  })
})

describe('una tarifa finita que SQL no puede guardar no es fiable', () => {
  it.each([
    ['1e8 (no cabe en numeric(10,2))', 1e8],
    ['1e308 (cents daría Infinity)', 1e308],
  ])('banda %s: respaldo para pintar, reliable false, céntimos finitos', (_n, valor) => {
    const r = nominalDeliveryFee('near', { near: valor }, 3)
    expect(r).toEqual({ cents: 300, reliable: false })
  })
})

describe('CAX-007: una cadena que JavaScript convierte y SQL también se PINTA como en develop', () => {
  // `Number('0x10')` = 16 y `'0x10'::numeric` = 16 (PostgreSQL 17): la cotización no puede
  // pintar el respaldo (51.00) y retirar el prepago, que es lo único que SQL aceptaría.
  it.each([
    ['hexadecimal', '0x10', 1600],
    ['binario', '0b11', 300],
    ['octal', '0o7', 700],
    ['exponente', '1e1', 1000],
  ])('banda %s: se pinta con su valor, reliable false', (_n, valor, esperado) => {
    expect(nominalDeliveryFee('near', { near: valor }, 3)).toEqual({
      cents: esperado,
      reliable: false,
    })
  })
  it('la tarifa del negocio como cadena hexadecimal también se pinta, reliable false', () => {
    expect(nominalDeliveryFee('near', {}, '0x10')).toEqual({ cents: 1600, reliable: false })
  })
})

describe('CAX-008: los céntimos que se pintan son siempre finitos y con formato monetario', () => {
  it.each([
    ['banda "1e308"', { near: '1e308' }, 3],
    ['banda "1e21"', { near: '1e21' }, 3],
    ['banda "100000000" (no cabe en numeric(10,2))', { near: '100000000' }, 3],
    ['banda "-1e308"', { near: '-1e308' }, 3],
  ])('%s: respaldo finito y reliable false', (_n, bandas, negocio) => {
    const r = nominalDeliveryFee('near', bandas, negocio)
    expect(r).toEqual({ cents: 300, reliable: false })
    expect(Number.isSafeInteger(r.cents)).toBe(true)
  })
  it('tarifa del negocio como cadena "1e308": respaldo S/ 2.00 finito y reliable false', () => {
    const r = nominalDeliveryFee('near', {}, '1e308')
    expect(r).toEqual({ cents: 200, reliable: false })
  })
  it('el tope se pinta tal cual: "99999999.99" cabe', () => {
    expect(nominalDeliveryFee('near', { near: '99999999.99' }, 3)).toEqual({
      cents: 9999999999,
      reliable: false,
    })
  })
})

describe('CAX-007: el tope de pintado es el que SQL acepta (numeric(10,2) redondea)', () => {
  it.each([
    [99999999.994, 9999999999],
    ['99999999.994', 9999999999],
    [-99999999.994, -9999999999],
  ])('tarifa de banda %s se pinta, reliable false', (valor, esperado) => {
    expect(nominalDeliveryFee('near', { near: valor }, 3)).toEqual({
      cents: esperado,
      reliable: false,
    })
  })
  it('99999999.995 ya no cabe: respaldo', () => {
    expect(nominalDeliveryFee('near', { near: 99999999.995 }, 3)).toEqual({
      cents: 300,
      reliable: false,
    })
  })
})

describe('CAX-009: isMoneyNumber solo admite céntimos completos del valor recibido', () => {
  it.each([
    [49.990000001],
    [49.999999999],
    [64.080000001],
    [0.0100000001],
    [1e-7],
    [2.675],
  ])('%s no es un valor ordinario (SQL lo compara exacto): la guardia se abstiene', (v) => {
    expect(isMoneyNumber(v)).toBe(false)
  })
  it.each([
    [49.99],
    [50],
    [64.08],
    [0.01],
    [0.1],
    [1.15],
    [-3.2],
    [99999999.99],
  ])('%s es un valor con céntimos completos', (v) => {
    expect(isMoneyNumber(v)).toBe(true)
  })
  it.each([
    [49.990000001, 4999],
    [16.005, 1601],
    [0.005, 1],
  ])('CAX-007: una tarifa de banda numérica %s (fracción de céntimo) se PINTA como en develop y no es fiable', (valor, esperado) => {
    expect(nominalDeliveryFee('near', { near: valor }, 3)).toEqual({
      cents: esperado,
      reliable: false,
    })
  })
  it('la tarifa del negocio numérica con fracción de céntimo también se pinta, reliable false', () => {
    expect(nominalDeliveryFee('near', {}, 16.005)).toEqual({ cents: 1601, reliable: false })
  })
})

describe('CAX-012: el texto crudo decide si un número tiene céntimos completos', () => {
  it.each([
    ['2', true],
    ['2.5', true],
    ['2.50', true],
    ['-16', true],
    ['2.0000000000000000001', false],
    ['79.99999999999999999', false],
    ['2.005', false],
    ['1e1', false],
    [null, false],
    [undefined, false],
  ])('isExactCentsText(%s) = %s', (t, esperado) => {
    expect(isExactCentsText(t)).toBe(esperado)
  })

  it('una tarifa con más precisión que un double: se pinta igual y no es fiable', () => {
    expect(nominalDeliveryFee('near', { near: 2, far: 2.5 }, 3, '2.0000000000000000001')).toEqual({
      cents: 200,
      reliable: false,
    })
  })

  it('con el texto de la banda en céntimos completos sigue siendo fiable; sin texto, no se comprueba', () => {
    expect(nominalDeliveryFee('near', { near: 2, far: 2.5 }, 3, '2')).toEqual({
      cents: 200,
      reliable: true,
    })
    expect(nominalDeliveryFee('near', { near: 2, far: 2.5 }, 3)).toEqual({
      cents: 200,
      reliable: true,
    })
  })

  it('un texto ausente (null) con un número presente no es fiable', () => {
    expect(nominalDeliveryFee('near', { near: 2 }, 3, null)).toEqual({
      cents: 200,
      reliable: false,
    })
  })
})
