import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El texto con el que el servidor dice «este número ya es de otra cuenta» lo reconoce la app Android por su contenido.
 * Esta copia y la de Android (`PhoneVerifyViewModelTest.kt`) deben ser idénticas a la original.
 */
const raiz = resolve(__dirname, '../..')
const original = resolve(raiz, 'fixtures/vectores/celular-otra-cuenta.json')
const copiaAndroid = resolve(
  raiz,
  '../../apps/android/customer/src/test/resources/fixtures/vectores/celular-otra-cuenta.json',
)

describe('vector del celular de otra cuenta', () => {
  it('CA-AUT-09 · la copia de Android es idéntica a la original', () => {
    expect(readFileSync(copiaAndroid, 'utf8')).toBe(readFileSync(original, 'utf8'))
  })
})
