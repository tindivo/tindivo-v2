import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CART_MAX_LINES, CART_MAX_MODIFIERS, CART_MAX_QUANTITY } from '../cart'
import { CheckoutQuoteRequestSchema } from '../client-requests'
import { CreateOrderRequestSchema } from '../requests'

/**
 * Vector compartido de la bolsa: la web (este test) y Android (`CartVectorTest.kt`) recorren el MISMO fichero.
 * Docs/producto/bolsa/capacidad.md, CA-CRT-06 y CA-CRT-09.
 */
interface Monto {
  id: string
  lineas: { precioBase: string; opciones: string[]; cantidad: number }[]
  valido: boolean
  subtotal: string | null
  motivo: string
}
interface Exceso {
  id: string
  tope: 'CART_MAX_LINES' | 'CART_MAX_QUANTITY' | 'CART_MAX_MODIFIERS'
  valor: number
  valido: boolean
  motivo: string
}
interface Vector {
  topes: Record<string, number>
  montos: Monto[]
  excesos: Exceso[]
}

const raiz = resolve(__dirname, '../..')
const original = resolve(raiz, 'fixtures/vectores/bolsa.json')
const copiaAndroid = resolve(
  raiz,
  '../../apps/android/customer/src/test/resources/fixtures/vectores/bolsa.json',
)
const vector = JSON.parse(readFileSync(original, 'utf8')) as Vector

/** Céntimos exactos de un precio de carta, o null si no lo es (más de dos decimales, negativo). */
function centimos(texto: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto)
  if (!m) return null
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0')
}

function subtotal(caso: Monto): string | null {
  let total = 0n
  for (const l of caso.lineas) {
    const base = centimos(l.precioBase)
    if (base === null) return null
    let unidad = base
    for (const o of l.opciones) {
      const c = centimos(o)
      if (c === null) return null
      unidad += c
    }
    total += unidad * BigInt(l.cantidad)
  }
  const s = total.toString().padStart(3, '0')
  return `${s.slice(0, -2)}.${s.slice(-2)}`
}

const ID = '00000000-0000-4000-8000-000000000002'
const NEGOCIO = '00000000-0000-4000-8000-000000000001'

function items(caso: Exceso) {
  const linea = (modifiers: string[], quantity: number) => ({ menuItemId: ID, quantity, modifiers })
  if (caso.tope === 'CART_MAX_LINES') {
    return Array.from({ length: caso.valor }, () => linea([], 1))
  }
  if (caso.tope === 'CART_MAX_QUANTITY') return [linea([], caso.valor)]
  return [
    linea(
      Array.from({ length: caso.valor }, () => ID),
      1,
    ),
  ]
}

describe('vector de la bolsa contra el contrato', () => {
  it('CA-CRT-09 · los topes del vector son los de packages/contracts/src/cart.ts', () => {
    expect(vector.topes).toEqual({
      CART_MAX_LINES,
      CART_MAX_QUANTITY,
      CART_MAX_MODIFIERS,
    })
  })

  it('CA-CRT-09 · el vector cubre cada tope por debajo y por encima', () => {
    for (const tope of Object.keys(vector.topes)) {
      const delTope = vector.excesos.filter((c) => c.tope === tope)
      expect(
        delTope.some((c) => c.valido),
        tope,
      ).toBe(true)
      expect(
        delTope.some((c) => !c.valido),
        tope,
      ).toBe(true)
    }
  })

  for (const caso of vector.montos) {
    it(`CA-CRT-06 · ${caso.id}: ${caso.valido ? 'subtotal exacto' : 'se rechaza'}`, () => {
      expect(subtotal(caso), caso.motivo).toBe(caso.valido ? caso.subtotal : null)
    })
  }

  for (const caso of vector.excesos) {
    const esperado = caso.valido ? 'se acepta' : 'se rechaza'
    it(`CA-CRT-09 · ${caso.id}: ${esperado} (CheckoutQuoteRequestSchema)`, () => {
      const r = CheckoutQuoteRequestSchema.safeParse({
        businessId: NEGOCIO,
        deliveryMethod: 'delivery',
        items: items(caso),
      })
      expect(r.success, caso.motivo).toBe(caso.valido)
    })

    it(`CA-CRT-09 · ${caso.id}: ${esperado} (CreateOrderRequestSchema)`, () => {
      const r = CreateOrderRequestSchema.safeParse({
        businessId: NEGOCIO,
        deliveryMethod: 'pickup',
        pickupTiming: 'later',
        paymentIntent: 'prepaid',
        customerName: 'Vecino',
        customerPhone: '912345678',
        items: items(caso),
      })
      expect(r.success, caso.motivo).toBe(caso.valido)
    })
  }

  it('el vector de la web y su copia de Android son idénticos byte a byte', () => {
    expect(readFileSync(copiaAndroid).equals(readFileSync(original))).toBe(true)
  })
})
