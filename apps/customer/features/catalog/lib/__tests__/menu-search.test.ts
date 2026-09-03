import { describe, expect, it } from 'vitest'
import {
  fold,
  type MenuHit,
  parseTerms,
  searchMenu,
  shouldOfferSearch,
} from '@/features/catalog/lib/menu-search'
import type { Category, MenuItem } from '@/features/catalog/types'

function item(name: string, description: string | null = null): MenuItem {
  return {
    id: `it-${name}`,
    name,
    description,
    base_price: 13,
    image_url: null,
    image_hue: null,
    category_id: 'c',
    is_available: true,
    is_compact: false,
    badges: [],
  }
}

function category(name: string, items: MenuItem[]): Category {
  return { id: `cat-${name}`, name, blurb: null, items }
}

/** Carta de juguete con la forma de la de Pizza Priamo. */
const carta: Category[] = [
  category('Pizzas', [
    item('Pizza Americana', 'Queso mozzarella, Jamón.'),
    item('Pizza Vegetariana', 'Queso mozzarella, Cebolla, Pimentón, Champiñón.'),
    item('Pizza Hawaiana', 'Queso mozzarella, Jamón, Piña.'),
  ]),
  category('Sánguche de pollo', [item('Sánguche clásico', 'Pollo deshilachado.')]),
  category('Bebidas', [
    item('Inca Kola 1L', null),
    item('Chicha morada', 'Jarra para acompañar la pizza.'),
  ]),
]

const names = (hits: MenuHit[]) => hits.map((h) => h.item.name)

describe('fold', () => {
  it('quita tildes y mayúsculas', () => {
    expect(fold('Champiñón')).toBe('champinon')
    expect(fold('SÁNGUCHE')).toBe('sanguche')
  })

  it('conserva la longitud, que es de lo que depende el resaltado', () => {
    for (const text of ['Champiñón', 'Sánguche de pollo', 'Pizza Américana', 'Inca Kola 1L']) {
      expect(fold(text)).toHaveLength(text.length)
    }
  })
})

describe('parseTerms', () => {
  it('ignora consultas por debajo del mínimo', () => {
    expect(parseTerms('p')).toEqual([])
    expect(parseTerms('  ')).toEqual([])
  })

  it('parte en términos, sin repetidos y sin puntuación', () => {
    expect(parseTerms('  Pollo,  a la BRASA ')).toEqual(['pollo', 'brasa'])
    expect(parseTerms('pizza pizza')).toEqual(['pizza'])
  })

  it('conserva las stopwords si son lo único que hay', () => {
    expect(parseTerms('de la')).toEqual(['de', 'la'])
  })
})

describe('searchMenu', () => {
  it('no busca nada hasta el mínimo de caracteres', () => {
    expect(searchMenu(carta, 'p')).toEqual([])
  })

  it('encuentra sin tildes en ambos sentidos', () => {
    expect(names(searchMenu(carta, 'champinon'))).toEqual(['Pizza Vegetariana'])
    expect(names(searchMenu(carta, 'sánguche'))).toEqual(['Sánguche clásico'])
  })

  it('no deja que una preposición descarte el plato', () => {
    const menu = [category('Pizzas', [item('Pizza Pollo BBQ', null)])]
    expect(names(searchMenu(menu, 'pizza de pollo'))).toEqual(['Pizza Pollo BBQ'])
  })

  it('exige todos los términos, en cualquier orden', () => {
    expect(names(searchMenu(carta, 'hawaiana pizza'))).toEqual(['Pizza Hawaiana'])
    expect(searchMenu(carta, 'pizza sushi')).toEqual([])
  })

  it('encuentra por descripción y por nombre de categoría', () => {
    expect(names(searchMenu(carta, 'piña'))).toEqual(['Pizza Hawaiana'])
    expect(names(searchMenu(carta, 'bebidas'))).toEqual(['Inca Kola 1L', 'Chicha morada'])
  })

  it('pone delante lo que casa en el nombre, no en la descripción', () => {
    // «Chicha morada» solo casa por su descripción: va última.
    expect(names(searchMenu(carta, 'pizza'))).toEqual([
      'Pizza Americana',
      'Pizza Vegetariana',
      'Pizza Hawaiana',
      'Chicha morada',
    ])
  })

  it('prioriza el prefijo de palabra sobre la aparición suelta', () => {
    const menu = [
      category('Cosas', [
        item('Gaseosa', 'Va bien con la hawaiana.'),
        item('Hawaiana familiar', null),
      ]),
    ]
    expect(names(searchMenu(menu, 'hawaiana'))).toEqual(['Hawaiana familiar', 'Gaseosa'])
  })

  it('devuelve los tramos alineados con el texto original', () => {
    const [hit] = searchMenu(carta, 'champinon')
    expect(hit).toBeDefined()
    const { start, end } = hit?.descriptionRanges[0] ?? { start: 0, end: 0 }
    expect(hit?.item.description?.slice(start, end)).toBe('Champiñón')
  })

  it('resalta todas las apariciones del término en el nombre', () => {
    const menu = [category('X', [item('Pizza de pizza', null)])]
    const [hit] = searchMenu(menu, 'pizza')
    expect(hit?.nameRanges).toEqual([
      { start: 0, end: 5 },
      { start: 9, end: 14 },
    ])
  })

  it('adjunta la categoría del plato para poder mostrarla', () => {
    const [hit] = searchMenu(carta, 'inca')
    expect(hit?.categoryName).toBe('Bebidas')
  })
})

describe('shouldOfferSearch', () => {
  it('no lo ofrece en cartas cortas', () => {
    // Pollería Nadia: 3 categorías, 6 platos.
    const nadia = [0, 1, 2].map((i) => category(`c${i}`, [item(`a${i}`), item(`b${i}`)]))
    expect(shouldOfferSearch(nadia)).toBe(false)
  })

  it('lo ofrece cuando hay muchas categorías aunque haya pocos platos', () => {
    const muchas = Array.from({ length: 6 }, (_, i) => category(`c${i}`, [item(`x${i}`)]))
    expect(shouldOfferSearch(muchas)).toBe(true)
  })

  it('lo ofrece cuando hay muchos platos aunque haya pocas categorías', () => {
    const larga = [
      category(
        'todo',
        Array.from({ length: 20 }, (_, i) => item(`x${i}`)),
      ),
    ]
    expect(shouldOfferSearch(larga)).toBe(true)
  })

  /*
   * Los dos de abajo clavan el corte exacto (12 platos / 4 categorías). Sin
   * ellos, los tres de arriba pasan con casi cualquier umbral entre 7 y 20:
   * un cambio de criterio se colaría sin que nada se pusiera rojo, y este
   * número decide si medio piloto tiene buscador o no.
   */
  it('clava el corte por número de platos', () => {
    const carta = (n: number) => [
      category(
        'todo',
        Array.from({ length: n }, (_, i) => item(`x${i}`)),
      ),
    ]
    expect(shouldOfferSearch(carta(11))).toBe(false)
    expect(shouldOfferSearch(carta(12))).toBe(true)
  })

  it('clava el corte por número de categorías', () => {
    const secciones = (n: number) =>
      Array.from({ length: n }, (_, i) => category(`c${i}`, [item(`x${i}`)]))
    expect(shouldOfferSearch(secciones(3))).toBe(false)
    expect(shouldOfferSearch(secciones(4))).toBe(true)
  })
})
