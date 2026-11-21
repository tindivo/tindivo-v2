import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES } from '../enums'
import { isTerminal, toTrackingStep } from '../order-status'

/**
 * Vector compartido de la proyección del estado a paso de seguimiento: el contrato (este test), Android
 * (`TrackingVectorTest.kt`) e iOS recorren el MISMO fichero (CA-TRK-03, CA-ORD-01).
 */
interface Caso {
  id: string
  status: string
  paso: string
  motivo: string
}

const raiz = resolve(__dirname, '../..')
const original = resolve(raiz, 'fixtures/vectores/seguimiento.json')
const copiaAndroid = resolve(
  raiz,
  '../../apps/android/customer/src/test/resources/fixtures/vectores/seguimiento.json',
)
const casos = JSON.parse(readFileSync(original, 'utf8')) as Caso[]

describe('vector de seguimiento contra el contrato', () => {
  it('CA-TRK-03 · cada estado del contrato tiene su caso y su paso es el de STATUS_TO_TRACKING', () => {
    expect(casos.map((c) => c.status).sort()).toEqual([...ORDER_STATUSES].sort())
    for (const c of casos)
      expect(toTrackingStep(c.status as (typeof ORDER_STATUSES)[number])).toBe(c.paso)
  })

  it('CA-TRK-07 · aceptar (confirmed, awaiting_payment) no mueve el paso: sigue en «received»', () => {
    for (const status of ['confirmed', 'awaiting_payment'])
      expect(casos.find((c) => c.status === status)?.paso).toBe('received')
  })

  it('CA-TRK-12 · delivered y cancelled son terminales', () => {
    expect(
      casos
        .filter((c) => isTerminal(c.status as (typeof ORDER_STATUSES)[number]))
        .map((c) => c.status)
        .sort(),
    ).toEqual(['cancelled', 'delivered'])
  })

  it('CA-ORD-01 · la copia de Android es idéntica al original', () => {
    expect(readFileSync(copiaAndroid, 'utf8')).toBe(readFileSync(original, 'utf8'))
  })
})
