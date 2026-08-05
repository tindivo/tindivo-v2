/**
 * RECONCILIACIÓN GLOBAL — `balance_due` = SUM del ledger, para TODOS los negocios.
 *
 * Es la query 3 de B.6 del spec de fase 2, convertida en test permanente. Lo que
 * la hace posible es la migración `0124`: hasta entonces `balance_due` se
 * mantenía a mano en seis funciones distintas y contingencia lo movía sin dejar
 * rastro en el ledger, así que esta comprobación **fallaba por diseño** y
 * escribirla habría sido ruido.
 *
 * Con `0124` pasa a ser una identidad: el trigger
 * `trg_business_charges_recalc_balance` recalcula el saldo completo desde
 * `business_charges` en cada escritura. Este test es lo que convierte
 * "balance_due = SUM del ledger" de aspiración documental en aserción
 * verificable — R-L1 en Docs/RIESGOS-LEDGER.md.
 *
 * NO SIEMBRA NADA. Mide el estado de la base tal como lo dejaron los demás
 * tests. Por eso es también un detector de regresiones ajenas: si cualquier
 * otro test —o cualquier función nueva— vuelve a tocar `balance_due` a mano,
 * este falla aunque el test culpable pase.
 *
 * PostgREST no expone agregados, así que la reconciliación se hace en JS sobre
 * las dos tablas completas, replicando la query del spec:
 *
 *   HAVING b.balance_due IS DISTINCT FROM
 *          COALESCE(SUM(bc.amount) FILTER (WHERE bc.status='pending'), 0)
 */
import { describe, expect, it } from 'vitest'
import { round2 } from './helpers/ledger-fixtures'
import { localClient } from './helpers/local-db'

describe('reconciliación global — balance_due = SUM(business_charges pending)', () => {
  it('ningún negocio tiene el saldo desalineado del ledger', async () => {
    const { data: negocios, error: bizErr } = await localClient
      .from('businesses')
      .select('id, name, balance_due')
    expect(bizErr).toBeNull()

    const { data: cargos, error: chErr } = await localClient
      .from('business_charges')
      .select('business_id, amount, status')
      .eq('status', 'pending')
    expect(chErr).toBeNull()

    const detallePorNegocio = new Map<string, number>()
    for (const c of cargos ?? []) {
      const previo = detallePorNegocio.get(c.business_id) ?? 0
      detallePorNegocio.set(c.business_id, previo + Number(c.amount))
    }

    const desalineados = (negocios ?? [])
      .map((b) => ({
        id: b.id,
        name: b.name,
        agregado: round2(Number(b.balance_due)),
        detalle: round2(detallePorNegocio.get(b.id) ?? 0),
      }))
      .filter((r) => r.agregado !== r.detalle)

    // El mensaje lleva las filas para que un fallo diga QUÉ negocio y por
    // cuánto, en vez de solo "esperaba 0, recibí 2".
    expect(
      desalineados,
      `Negocios con balance_due != SUM(ledger pending):\n${JSON.stringify(desalineados, null, 2)}`,
    ).toHaveLength(0)
  })

  it('ningún cargo pendiente cuelga de un negocio inexistente', async () => {
    const { data: negocios, error: bizErr } = await localClient.from('businesses').select('id')
    expect(bizErr).toBeNull()

    const { data: cargos, error: chErr } = await localClient
      .from('business_charges')
      .select('id, business_id')
      .eq('status', 'pending')
    expect(chErr).toBeNull()

    const ids = new Set((negocios ?? []).map((b) => b.id))
    const huerfanos = (cargos ?? []).filter((c) => !ids.has(c.business_id))

    expect(
      huerfanos,
      `Cargos pendientes sin negocio:\n${JSON.stringify(huerfanos, null, 2)}`,
    ).toHaveLength(0)
  })
})
