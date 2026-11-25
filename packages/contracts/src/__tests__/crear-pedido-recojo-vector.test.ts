import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CreateOrderRequestSchema } from '../requests'

/**
 * Vector compartido del pedido de RECOJO de la app Android: el cuerpo que `CheckoutViewModelTest.kt` comprueba que
 * Android envía, byte a byte, a `POST /customer/orders`. Aquí lo valida el esquema real que la ruta aplica
 * (`CreateOrderRequestSchema.parse`, `apps/api/app/api/v1/customer/orders/route.ts`). Si Android deja de mandar un
 * campo que el esquema exige (CAX-001: `pickupTiming`), uno de los dos tests falla.
 */
const raiz = resolve(__dirname, '../..')
const original = resolve(raiz, 'fixtures/vectores/crear-pedido-recojo.json')
const copiaAndroid = resolve(
  raiz,
  '../../apps/android/customer/src/test/resources/fixtures/vectores/crear-pedido-recojo.json',
)
const vector = JSON.parse(readFileSync(original, 'utf8')) as { cuerpo: Record<string, unknown> }

describe('cuerpo de recojo con prepago que manda Android contra el esquema de crear pedido', () => {
  it('lo acepta el esquema real, con pickupTiming "later" y prepago', () => {
    const r = CreateOrderRequestSchema.safeParse(vector.cuerpo)
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
    expect(r.data?.deliveryMethod).toBe('pickup')
    expect(r.data?.paymentIntent).toBe('prepaid')
    expect(r.data?.pickupTiming).toBe('later')
  })

  it('sin pickupTiming el mismo cuerpo se rechaza: por eso Android lo envía', () => {
    const { pickupTiming: _omitido, ...sinTiming } = vector.cuerpo
    const r = CreateOrderRequestSchema.safeParse(sinTiming)
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path.join('.') === 'pickupTiming')).toBe(true)
  })

  it('con efectivo el recojo se rechaza aunque lleve pickupTiming', () => {
    const r = CreateOrderRequestSchema.safeParse({ ...vector.cuerpo, paymentIntent: 'cash' })
    expect(r.success).toBe(false)
  })

  it('el vector y su copia de Android son idénticos byte a byte', () => {
    expect(readFileSync(copiaAndroid).equals(readFileSync(original))).toBe(true)
  })
})
