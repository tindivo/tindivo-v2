import { describe, expect, it } from 'vitest'
import {
  planReorder,
  type ReorderMenuDish,
  type ReorderMenuGroup,
  type ReorderOriginalLine,
} from './reorder'

const BIZ = 'b0000000-0000-4000-8000-000000000001'
const PIZZA = 'd0000000-0000-4000-8000-000000000001'

function group(over: Partial<ReorderMenuGroup> & Pick<ReorderMenuGroup, 'id' | 'name'>) {
  return {
    selection_type: 'single',
    is_required: false,
    min_selections: 0,
    max_selections: 1,
    options: [],
    ...over,
  } satisfies ReorderMenuGroup
}

const size = group({
  id: 'g-size',
  name: 'Tamaño',
  is_required: true,
  min_selections: 1,
  options: [
    { id: 'o-small', name: 'Pequeña', priceCents: 1000, isAvailable: true },
    { id: 'o-large', name: 'Grande', priceCents: 2000, isAvailable: true },
  ],
})
const cheese = { id: 'o-cheese', name: 'Queso', priceCents: 150, isAvailable: true }
const sauce = { id: 'o-sauce', name: 'Salsa', priceCents: 50, isAvailable: true }
const extras = group({
  id: 'g-extras',
  name: 'Extras',
  selection_type: 'multi',
  max_selections: 2,
  options: [cheese, sauce],
})

function pizza(over: Partial<ReorderMenuDish> = {}): ReorderMenuDish {
  return {
    id: PIZZA,
    businessId: BIZ,
    name: 'Pizza',
    basePriceCents: 500,
    isAvailable: true,
    deleted: false,
    orderableNow: true,
    imageUrl: 'https://img/pizza.jpg',
    thumbnailUrl: null,
    groups: [size, extras],
    ...over,
  }
}

function line(over: Partial<ReorderOriginalLine> = {}): ReorderOriginalLine {
  return {
    menuItemId: PIZZA,
    itemName: 'Pizza (antes)',
    quantity: 2,
    note: null,
    unitPriceCents: 1650,
    // Guardadas en otro orden que el del menú.
    modifiers: [
      { groupName: 'Extras', optionName: 'Queso' },
      { groupName: 'Tamaño', optionName: 'Pequeña' },
    ],
    ...over,
  }
}

const plan = (lines: ReorderOriginalLine[], dish: ReorderMenuDish | null = pizza()) =>
  planReorder(BIZ, lines, new Map(dish ? [[dish.id, dish]] : []))

describe('planReorder (D-51)', () => {
  it('rearma la línea con ids, nombres y precios actuales, en el orden del menú', () => {
    expect(plan([line({ note: '  sin cebolla ' })])).toEqual({
      items: [
        {
          menuItemId: PIZZA,
          name: 'Pizza',
          quantity: 2,
          note: 'sin cebolla',
          basePriceCents: 500,
          modifiers: [
            { id: 'o-small', groupName: 'Tamaño', optionName: 'Pequeña', priceCents: 1000 },
            { id: 'o-cheese', groupName: 'Extras', optionName: 'Queso', priceCents: 150 },
          ],
          unitPriceCents: 1650,
          imageUrl: 'https://img/pizza.jpg',
          thumbnailUrl: null,
        },
      ],
      changes: [],
    })
  })

  it('un precio distinto entra en la bolsa y avisa con el precio unitario de antes y de ahora', () => {
    const result = plan([line({ unitPriceCents: 1500 })])
    expect(result.items).toHaveLength(1)
    expect(result.changes).toEqual([
      {
        kind: 'price_changed',
        itemName: 'Pizza (antes)',
        menuItemId: PIZZA,
        beforeCents: 1500,
        afterCents: 1650,
      },
    ])
  })

  it.each([
    ['sin id (plato borrado del todo)', line({ menuItemId: null }), pizza()],
    ['el plato ya no existe', line(), null],
    ['borrado lógico', line(), pizza({ deleted: true })],
    ['de otro negocio', line(), pizza({ businessId: 'otro' })],
  ])('retirado: %s', (_name, original, dish) => {
    expect(plan([original], dish)).toEqual({
      items: [],
      changes: [
        {
          kind: 'item_removed',
          itemName: 'Pizza (antes)',
          menuItemId: null,
          beforeCents: null,
          afterCents: null,
        },
      ],
    })
  })

  it.each([
    ['agotado', pizza({ isAvailable: false })],
    ['fuera de su franja', pizza({ orderableNow: false })],
  ])('no disponible ahora: %s', (_name, dish) => {
    expect(plan([line()], dish).changes).toMatchObject([
      { kind: 'item_unavailable', menuItemId: PIZZA },
    ])
    expect(plan([line()], dish).items).toEqual([])
  })

  it.each([
    ['opción retirada', pizza({ groups: [size, { ...extras, options: [sauce] }] })],
    [
      'opción agotada',
      pizza({
        groups: [size, { ...extras, options: [{ ...cheese, isAvailable: false }] }],
      }),
    ],
    ['grupo desvinculado', pizza({ groups: [size] })],
    [
      'dos grupos con el mismo nombre',
      pizza({ groups: [size, extras, { ...extras, id: 'g-x2' }] }),
    ],
    [
      'dos opciones con el mismo nombre',
      pizza({
        groups: [size, { ...extras, options: [...extras.options, { ...cheese, id: 'o-c2' }] }],
      }),
    ],
    [
      'grupo obligatorio nuevo',
      pizza({
        groups: [
          size,
          extras,
          group({
            id: 'g-drink',
            name: 'Bebida',
            is_required: true,
            min_selections: 1,
            options: [{ id: 'o-cola', name: 'Cola', priceCents: 0, isAvailable: true }],
          }),
        ],
      }),
    ],
    ['ahora admite menos opciones', pizza({ groups: [size, { ...extras, max_selections: 0 }] })],
  ])('vuelve a elegir: %s', (_name, dish) => {
    const original = line({
      modifiers: [
        { groupName: 'Tamaño', optionName: 'Pequeña' },
        { groupName: 'Extras', optionName: 'Queso' },
      ],
    })
    expect(plan([original], dish)).toEqual({
      items: [],
      changes: [
        {
          kind: 'choose_again',
          itemName: 'Pizza (antes)',
          menuItemId: PIZZA,
          beforeCents: null,
          afterCents: null,
        },
      ],
    })
  })

  it('una opción guardada dos veces no se rearma', () => {
    const original = line({
      modifiers: [
        { groupName: 'Tamaño', optionName: 'Pequeña' },
        { groupName: 'Extras', optionName: 'Queso' },
        { groupName: 'Extras', optionName: 'Queso' },
      ],
    })
    expect(plan([original]).changes).toMatchObject([{ kind: 'choose_again' }])
  })

  it('una nota que pasa del tope no se recorta a escondidas', () => {
    expect(plan([line({ note: 'x'.repeat(141) })]).changes).toMatchObject([
      { kind: 'choose_again' },
    ])
    expect(plan([line({ note: '   ' })]).items[0]?.note).toBeNull()
  })

  it('compara ids sin distinguir mayúsculas y conserva el orden de las líneas', () => {
    const soup: ReorderMenuDish = {
      ...pizza(),
      id: 'd0000000-0000-4000-8000-000000000002',
      name: 'Sopa',
      groups: [],
      basePriceCents: 1000,
    }
    const result = planReorder(
      BIZ,
      [
        line({ menuItemId: soup.id, itemName: 'Sopa', modifiers: [], unitPriceCents: 1000 }),
        line({ menuItemId: PIZZA.toUpperCase() }),
      ],
      new Map([
        [PIZZA, pizza()],
        [soup.id, soup],
      ]),
    )
    expect(result.items.map((i) => i.name)).toEqual(['Sopa', 'Pizza'])
    expect(result.changes).toEqual([])
  })
})
