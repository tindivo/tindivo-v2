import { describe, expect, it } from 'vitest'
import { hasOptions, isCompactSection, plainLine } from '@/features/catalog/lib/menu-density'
import type { Category, MenuItem } from '@/features/catalog/types'

function item(name: string, opts: Partial<MenuItem> = {}): MenuItem {
  return {
    id: `it-${name}`,
    name,
    description: null,
    base_price: 4,
    image_url: null,
    image_hue: null,
    category_id: 'c',
    is_available: true,
    is_compact: false,
    badges: [],
    ...opts,
  }
}

const seccion = (name: string, items: MenuItem[]): Category => ({
  id: `cat-${name}`,
  name,
  blurb: null,
  items,
})

const FOTO = 'https://x.supabase.co/storage/v1/object/public/menu-items/a.jpg'

describe('isCompactSection', () => {
  it('es lista cuando no hay ni una foto ni una descripción', () => {
    // Bebidas de La Florencia: once refrescos embotellados, el nombre es todo.
    const bebidas = seccion('BEBIDAS', [
      item('Inca Kola - 1.5 L'),
      item('Coca Cola - 500 ml'),
      item('Agua mineral (sin gas)'),
    ])
    expect(isCompactSection(bebidas)).toBe(true)
  })

  it('NO es lista si algún plato tiene descripción aunque ninguno tenga foto', () => {
    // «Pan al ajo» de Pizza Priamo: sin fotos, pero el texto es lo que vende.
    // Este es el caso que rompía la regla de «sin foto» a secas.
    const panAlAjo = seccion('Pan al ajo', [
      item('Pan al ajo simple', { description: 'Con mantequilla de ajo y orégano.' }),
      item('Pan al ajo con queso', { description: 'Mozzarella fundida encima.' }),
      item('Pan al ajo familiar'),
    ])
    expect(isCompactSection(panAlAjo)).toBe(false)
  })

  it('NO es lista si algún plato tiene foto aunque ninguno tenga descripción', () => {
    const mixta = seccion('Bebidas', [item('Chicha morada', { image_url: FOTO }), item('Té')])
    expect(isCompactSection(mixta)).toBe(false)
  })

  it('no cuenta como descripción una cadena en blanco', () => {
    // El panel de negocios guarda '' cuando la cajera borra el campo, no null.
    const vacias = seccion('Adicionales', [item('Chorizo', { description: '   ' })])
    expect(isCompactSection(vacias)).toBe(true)
  })

  it('una sección vacía no es lista: no hay nada que dibujar', () => {
    expect(isCompactSection(seccion('Sin platos', []))).toBe(false)
  })
})

describe('hasOptions', () => {
  it('un grupo sin opciones no cuenta', () => {
    expect(
      hasOptions({
        modifier_groups: [
          {
            id: 'g',
            name: 'Vacío',
            selection_type: 'single',
            is_required: false,
            min_selections: 0,
            max_selections: null,
            price_display: 'delta',
            options: [],
          },
        ],
      }),
    ).toBe(false)
  })

  it('sin grupos, no hay nada que preguntar', () => {
    expect(hasOptions({ modifier_groups: undefined })).toBe(false)
  })
})

describe('plainLine', () => {
  it('arma la línea del plato que no hay que configurar', () => {
    const agua = item('Agua mineral (sin gas)', { base_price: 2, image_hue: 200 })
    expect(plainLine(agua)).toEqual({
      itemId: agua.id,
      name: 'Agua mineral (sin gas)',
      unitPrice: 2,
      quantity: 1,
      modifiers: [],
      note: null,
      hue: 200,
      imageUrl: null,
    })
  })

  it('cae al hue por defecto cuando el plato no trae ninguno', () => {
    expect(plainLine(item('Té')).hue).toBe(14)
  })
})
