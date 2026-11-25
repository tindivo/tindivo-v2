import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAYMENT_INTENTS, PaymentIntentSchema } from '../enums'
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

  // CAX-003: el valor tiene que ser un intento VÁLIDO del enum (`pending_cash` es el que manda Android en delivery con
  // efectivo), para que el rechazo sea el de la regla «un recojo se paga por adelantado» y no un error de enum.
  it('el enum incluye pending_cash, el intento de efectivo que Android manda en delivery', () => {
    expect(PAYMENT_INTENTS).toContain('pending_cash')
  })

  for (const intento of PAYMENT_INTENTS.filter((i) => i !== 'prepaid')) {
    it(`con ${intento} el recojo se rechaza por la regla de prepago, no por el enum`, () => {
      expect(PaymentIntentSchema.safeParse(intento).success).toBe(true)
      const r = CreateOrderRequestSchema.safeParse({ ...vector.cuerpo, paymentIntent: intento })
      expect(r.success).toBe(false)
      const delPago = r.error?.issues.filter((i) => i.path.join('.') === 'paymentIntent') ?? []
      expect(delPago.map((i) => i.message)).toEqual(['Un recojo se paga por adelantado'])
      expect(delPago.every((i) => i.code === 'custom')).toBe(true)
    })
  }

  it('el vector y su copia de Android son idénticos byte a byte', () => {
    expect(readFileSync(copiaAndroid).equals(readFileSync(original))).toBe(true)
  })
})
