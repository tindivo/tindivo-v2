import { describe, expect, it } from 'vitest'
import type { BusinessDetail, ModGroupData } from '../../features/catalog/types'
import { type ValidatableCartLine, validateCartAgainstCatalog } from '../cart-validation'

const group: ModGroupData = {
  id: 'size',
  name: 'Tamaño',
  selection_type: 'single',
  is_required: false,
  min_selections: 0,
  max_selections: null,
  price_display: 'delta',
  options: [
    { id: 'small', name: 'Pequeña', description: null, additional_price: 0 },
    { id: 'large', name: 'Grande', description: null, additional_price: 0 },
    { id: 'medium', name: 'Mediana', description: null, additional_price: 0 },
  ],
}

const line: ValidatableCartLine = {
  key: 'pizza',
  itemId: 'pizza',
  name: 'Pizza',
  unitPrice: 10,
  quantity: 1,
  modifiers: [],
}

function catalog(groups: ModGroupData[]): BusinessDetail {
  return {
    business: {
      id: 'restaurant',
      name: 'Pizzería',
      tagline: null,
      accent_color: 'red',
      banner_url: null,
      estimated_eta_min: 15,
      estimated_eta_max: 30,
      accepts_web_pickup: true,
      accepts_web_delivery: true,
    },
    schedule: [],
    categories: [
      {
        id: 'pizzas',
        name: 'Pizzas',
        blurb: null,
        items: [
          {
            id: 'pizza',
            name: 'Pizza',
            description: null,
            category_id: 'pizzas',
            base_price: 10,
            image_url: null,
            image_hue: null,
            is_available: true,
            is_compact: false,
            badges: [],
            modifier_groups: groups,
          },
        ],
      },
    ],
  }
}

const withOptions = (...ids: string[]): ValidatableCartLine => ({
  ...line,
  modifiers: ids.map((optionId) => ({ optionId, optionName: optionId, price: 0 })),
})

describe('el carrito avisa si cambiaron las reglas de las opciones guardadas', () => {
  it('un grupo que pasa a obligatorio pide volver a elegir las opciones', () => {
    expect(validateCartAgainstCatalog([line], catalog([group])).validLines).toEqual([line])
    const result = validateCartAgainstCatalog([line], catalog([{ ...group, is_required: true }]))
    expect(result.validLines).toEqual([])
    expect(result.invalidLines).toEqual([
      {
        key: 'pizza',
        name: 'Pizza',
        quantity: 1,
        issues: [
          {
            kind: 'invalid_selection',
            message: 'El negocio cambió las opciones de este plato. Vuelve a elegirlas.',
          },
        ],
      },
    ])
  })

  it('bajar el máximo invalida una selección que antes era válida', () => {
    const saved = withOptions('small', 'large')
    const multi: ModGroupData = { ...group, selection_type: 'multi', max_selections: 2 }
    expect(validateCartAgainstCatalog([saved], catalog([multi])).invalidLines).toEqual([])
    const result = validateCartAgainstCatalog([saved], catalog([{ ...multi, max_selections: 1 }]))
    expect(result.invalidLines[0]?.issues).toEqual([
      {
        kind: 'invalid_selection',
        message: 'El negocio cambió las opciones de este plato. Vuelve a elegirlas.',
      },
    ])
  })

  it('elevar el mínimo de un multi obligatorio invalida la línea', () => {
    const saved = withOptions('small')
    const result = validateCartAgainstCatalog(
      [saved],
      catalog([{ ...group, selection_type: 'multi', is_required: true, min_selections: 2 }]),
    )
    expect(result.validLines).toEqual([])
    expect(result.invalidLines[0]?.issues).toEqual([
      {
        kind: 'invalid_selection',
        message: 'El negocio cambió las opciones de este plato. Vuelve a elegirlas.',
      },
    ])
  })

  it('las opciones repetidas guardadas se rechazan sin deduplicarlas', () => {
    const result = validateCartAgainstCatalog(
      [withOptions('small', 'small')],
      catalog([{ ...group, selection_type: 'multi' }]),
    )
    expect(result.validLines).toEqual([])
    expect(result.invalidLines[0]?.issues).toEqual([
      {
        kind: 'invalid_selection',
        message: 'El negocio cambió las opciones de este plato. Vuelve a elegirlas.',
      },
    ])
  })

  it('dos reglas incumplidas en una línea producen una sola incidencia', () => {
    const result = validateCartAgainstCatalog(
      [line],
      catalog([
        { ...group, is_required: true },
        {
          ...group,
          id: 'crust',
          name: 'Masa',
          is_required: true,
          options: [{ id: 'thin', name: 'Delgada', description: null, additional_price: 0 }],
        },
      ]),
    )
    expect(result.validLines).toEqual([])
    expect(result.invalidLines).toHaveLength(1)
    expect(result.invalidLines[0]?.issues).toEqual([
      {
        kind: 'invalid_selection',
        message: 'El negocio cambió las opciones de este plato. Vuelve a elegirlas.',
      },
    ])
  })

  it('un mínimo opcional no bloquea el carrito y un plato sin grupos sigue siendo válido', () => {
    expect(
      validateCartAgainstCatalog(
        [line],
        catalog([{ ...group, selection_type: 'multi', min_selections: 2 }]),
      ).validLines,
    ).toEqual([line])
    expect(validateCartAgainstCatalog([line], catalog([])).validLines).toEqual([line])
  })
})
