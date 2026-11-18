import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AddressLineSchema, AddressReferenceSchema } from '../primitives'

/**
 * Vector compartido de dirección: la web (este test) y Android
 * (`AddressVectorTest.kt`) recorren el MISMO fichero. Si una plataforma
 * discrepa, el caso se marca con `"discrepa": "<plataforma>"` en el JSON.
 */
interface Caso {
  id: string
  campo: 'linea' | 'referencia'
  valor: string
  valido: boolean
  motivo: string
  discrepa?: string
}

const raiz = resolve(__dirname, '../..')
const original = resolve(raiz, 'test-vectors/direccion.json')
const copiaAndroid = resolve(
  raiz,
  '../../apps/android/customer/src/test/resources/test-vectors/direccion.json',
)
const casos = JSON.parse(readFileSync(original, 'utf8')) as Caso[]

const esquema = { linea: AddressLineSchema, referencia: AddressReferenceSchema }

describe('vector de dirección contra los esquemas del contrato', () => {
  it('CA-ADR-01 · cubre mínimo y máximo de línea y de referencia, uno a cada lado', () => {
    for (const campo of ['linea', 'referencia'] as const) {
      const delCampo = casos.filter((c) => c.campo === campo)
      expect(delCampo.some((c) => c.id.endsWith('min-menos-uno') && !c.valido)).toBe(true)
      expect(delCampo.some((c) => c.id.endsWith('min-justo') && c.valido)).toBe(true)
      expect(delCampo.some((c) => c.id.endsWith('max-justo') && c.valido)).toBe(true)
      expect(delCampo.some((c) => c.id.endsWith('max-mas-uno') && !c.valido)).toBe(true)
    }
  })

  for (const caso of casos.filter((c) => !c.discrepa)) {
    const ca = caso.id.includes('min') || caso.id.includes('max') ? 'CA-ADR-01' : 'CA-ADR-02'
    it(`${ca} · ${caso.campo} · ${caso.id}: ${caso.valido ? 'se acepta' : 'se rechaza'}`, () => {
      expect(esquema[caso.campo].safeParse(caso.valor).success, caso.motivo).toBe(caso.valido)
    })
  }

  it('el vector de la web y su copia de Android son idénticos byte a byte', () => {
    expect(readFileSync(copiaAndroid).equals(readFileSync(original))).toBe(true)
  })
})
