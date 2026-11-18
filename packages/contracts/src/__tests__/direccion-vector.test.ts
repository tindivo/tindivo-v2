import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AddressLineSchema, AddressReferenceFormSchema, AddressReferenceSchema } from '../primitives'

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
const original = resolve(raiz, 'fixtures/vectores/direccion.json')
const copiaAndroid = resolve(
  raiz,
  '../../apps/android/customer/src/test/resources/fixtures/vectores/direccion.json',
)
const casos = JSON.parse(readFileSync(original, 'utf8')) as Caso[]

const esquema = { linea: AddressLineSchema, referencia: AddressReferenceFormSchema }

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

describe('piso de la API v1 para la referencia (API-3)', () => {
  // El formulario pide 15 (D-31), pero la API v1 sigue aceptando desde 5: una app instalada no se rompe y una
  // dirección guardada con el mínimo anterior sigue sirviendo para pedir. Subir este piso es otra versión del contrato.
  it('la API acepta una referencia de 5 a 14 caracteres que el formulario rechaza', () => {
    for (const valor of ['Jr1 J', 'Frente al pozo']) {
      expect(AddressReferenceSchema.safeParse(valor).success).toBe(true)
      expect(AddressReferenceFormSchema.safeParse(valor).success).toBe(false)
    }
  })

  it('la API rechaza por debajo de su piso y el texto basura', () => {
    expect(AddressReferenceSchema.safeParse('Jr1x').success).toBe(false)
    expect(AddressReferenceSchema.safeParse('lala lala').success).toBe(false)
  })
})
