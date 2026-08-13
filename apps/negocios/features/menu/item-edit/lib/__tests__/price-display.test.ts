import { describe, expect, it } from 'vitest'
import type { ModifierGroup, ModifierOption, PriceDisplay } from '../../types'
import {
  acceptsTotalPricing,
  applyTotalPrices,
  currentTotals,
  findTotalPricingGroup,
  itemMaxPrice,
  itemMinPrice,
  optionDisplayPrice,
  priceWarning,
} from '../utils'

function opt(localId: string, name: string, additional_price: number): ModifierOption {
  return { id: localId, localId, name, additional_price, is_available: true, display_order: 0 }
}

function group(over: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'g1',
    localId: 'g1',
    name: 'Tamaño',
    selection_type: 'single',
    is_required: true,
    min_selections: 1,
    max_selections: 1,
    price_display: 'delta' as PriceDisplay,
    display_order: 0,
    options: [],
    isExpanded: true,
    ...over,
  }
}

/** Deltas de un grupo, en orden, para comparar de un vistazo. */
function deltas(g: ModifierGroup): number[] {
  return g.options.filter((o) => !o.isDeleted).map((o) => o.additional_price)
}

describe('applyTotalPrices', () => {
  it('reparte los precios finales en precio base + deltas', () => {
    const pizza = group({ price_display: 'total', options: [] })
    const totals = new Map([
      ['peq', 13],
      ['med', 26],
      ['gra', 35],
    ])
    const withOptions = {
      ...pizza,
      options: [opt('peq', 'Pequeña', 0), opt('med', 'Mediana', 0), opt('gra', 'Grande', 0)],
    }

    const { basePrice, group: out } = applyTotalPrices(withOptions, totals, 0)

    // Este es el bug que motivó todo: antes la cajera escribía 13 en el precio
    // base y otra vez 13 en "Pequeña", y la pizza chica salía a 26.
    expect(basePrice).toBe(13)
    expect(deltas(out)).toEqual([0, 13, 22])
  })

  it('renormaliza cuando la opción más barata cambia', () => {
    const g = group({
      price_display: 'total',
      options: [opt('peq', 'Pequeña', 0), opt('med', 'Mediana', 13)],
    })
    const totals = currentTotals(13, g)
    totals.set('peq', 10)

    const { basePrice, group: out } = applyTotalPrices(g, totals, 13)

    expect(basePrice).toBe(10)
    expect(deltas(out)).toEqual([0, 16])
  })

  it('no mueve lo que paga el cliente al encender el switch', () => {
    // Plato mal cargado: base 13 + "Pequeña" +13. El cliente ya pagaba 26.
    const g = group({
      options: [opt('peq', 'Pequeña', 13), opt('med', 'Mediana', 26)],
    })
    const totals = currentTotals(13, g)
    expect([...totals.values()]).toEqual([26, 39])

    const { basePrice, group: out } = applyTotalPrices({ ...g, price_display: 'total' }, totals, 13)

    // Los precios finales siguen siendo 26 y 39: solo cambia el reparto, y de
    // paso el "Desde S/ 13" deja de prometer una pizza que no existía.
    expect(basePrice).toBe(26)
    expect(deltas(out)).toEqual([0, 13])
    expect(out.options.map((o) => optionDisplayPrice(basePrice, out, o))).toEqual([26, 39])
  })

  it('sube el precio base al borrar la opción más barata', () => {
    const g = group({
      price_display: 'total',
      options: [opt('peq', 'Pequeña', 0), opt('med', 'Mediana', 13)],
    })
    const totals = currentTotals(13, g)
    totals.delete('peq')
    const marked = {
      ...g,
      options: g.options.map((o) => (o.localId === 'peq' ? { ...o, isDeleted: true } : o)),
    }

    const { basePrice, group: out } = applyTotalPrices(marked, totals, 13)

    expect(basePrice).toBe(26)
    expect(deltas(out)).toEqual([0])
  })

  it('conserva el precio base si el grupo se queda sin opciones', () => {
    const g = group({ price_display: 'total', options: [] })
    const { basePrice } = applyTotalPrices(g, new Map(), 18)
    expect(basePrice).toBe(18)
  })

  it('no arrastra basura de coma flotante', () => {
    const g = group({
      price_display: 'total',
      options: [opt('a', 'A', 0), opt('b', 'B', 0)],
    })
    const totals = new Map([
      ['a', 0.1],
      ['b', 0.3],
    ])
    const { group: out } = applyTotalPrices(g, totals, 0)
    expect(deltas(out)).toEqual([0, 0.2])
  })
})

describe('acceptsTotalPricing', () => {
  it('solo acepta obligatorio de elegir 1', () => {
    expect(acceptsTotalPricing(group())).toBe(true)
    expect(acceptsTotalPricing(group({ is_required: false, min_selections: 0 }))).toBe(false)
    expect(acceptsTotalPricing(group({ selection_type: 'multi', max_selections: 3 }))).toBe(false)
  })
})

describe('findTotalPricingGroup', () => {
  it('ignora grupos borrados o sin opciones', () => {
    const vacio = group({ localId: 'vacio', price_display: 'total', options: [] })
    const borrado = group({
      localId: 'borrado',
      price_display: 'total',
      isDeleted: true,
      options: [opt('x', 'X', 0)],
    })
    const vivo = group({ localId: 'vivo', price_display: 'total', options: [opt('y', 'Y', 0)] })

    expect(findTotalPricingGroup([vacio, borrado, vivo])?.localId).toBe('vivo')
    expect(findTotalPricingGroup([vacio, borrado])).toBeUndefined()
  })
})

describe('resumen de precios con un grupo de precio total', () => {
  const tamano = group({
    price_display: 'total',
    options: [opt('peq', 'Pequeña', 0), opt('med', 'Mediana', 13), opt('gra', 'Grande', 22)],
  })
  const salsas = group({
    localId: 'g2',
    name: 'Salsas extras',
    selection_type: 'multi',
    is_required: false,
    min_selections: 0,
    max_selections: 2,
    options: [opt('aji', 'Ají', 2), opt('chi', 'Chimichurri', 3)],
  })

  it('el mínimo es la pizza chica y el máximo la grande con extras', () => {
    expect(itemMinPrice(13, [tamano, salsas])).toBe(13)
    expect(itemMaxPrice(13, [tamano, salsas])).toBe(13 + 22 + 3 + 2)
  })

  it('calla el aviso de precio base, que ahí ya no se escribe a mano', () => {
    expect(priceWarning(13, [tamano, salsas])).toBeNull()
  })

  it('sigue avisando cuando el precio base sí lo escribe el negocio', () => {
    const soloDelta = { ...tamano, price_display: 'delta' as PriceDisplay }
    expect(priceWarning(13, [soloDelta, salsas])).toBeNull() // la más barata es 0
    const conRecargo = group({
      options: [opt('peq', 'Pequeña', 13), opt('med', 'Mediana', 26)],
    })
    expect(priceWarning(13, [conRecargo])).toMatchObject({ suggested: 26, delta: 13 })
  })
})
