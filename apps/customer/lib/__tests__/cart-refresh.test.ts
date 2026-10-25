import { describe, expect, it, vi } from 'vitest'
import type { BusinessDetail } from '../../features/catalog/types'
import type { CartLine } from '../cart'
import { refreshCartValidation } from '../cart-refresh'
import { type CartValidationResult, validateCartAgainstCatalog } from '../cart-validation'

const line: CartLine = {
  key: 'pizza',
  itemId: 'pizza',
  name: 'Pizza',
  unitPrice: 10,
  quantity: 1,
  modifiers: [],
  note: null,
  hue: 0,
  imageUrl: null,
}

function catalog(required = false): BusinessDetail {
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
            modifier_groups: [
              {
                id: 'size',
                name: 'Tamaño',
                selection_type: 'single',
                is_required: required,
                min_selections: 0,
                max_selections: null,
                price_display: 'delta',
                options: [{ id: 'small', name: 'Pequeña', description: null, additional_price: 0 }],
              },
            ],
          },
        ],
      },
    ],
  }
}

function createCart() {
  let validation: CartValidationResult | null = null
  const cart = {
    businessId: 'restaurant' as string | null,
    lines: [line],
    validateAgainst: vi.fn((menu: BusinessDetail) => {
      validation = validateCartAgainstCatalog(cart.lines, menu)
    }),
    hasInvalidLines: () => (validation?.invalidLines.length ?? 0) > 0,
  }
  return cart
}

describe('refrescar la validación de la bolsa antes de pagar', () => {
  it('devuelve ok y valida la bolsa contra el menú recién descargado', async () => {
    const cart = createCart()
    const menu = catalog()
    const fetchCatalog = vi.fn(async () => ({ data: menu }))

    expect(await refreshCartValidation(fetchCatalog, () => cart)).toBe('ok')
    expect(fetchCatalog).toHaveBeenCalledExactlyOnceWith('restaurant')
    expect(cart.validateAgainst).toHaveBeenCalledExactlyOnceWith(menu)
    expect(cart.hasInvalidLines()).toBe(false)
  })

  it('devuelve invalid si el menú nuevo vuelve obligatorio un grupo', async () => {
    const cart = createCart()
    cart.validateAgainst(catalog())
    expect(cart.hasInvalidLines()).toBe(false)
    const menu = catalog(true)

    expect(
      await refreshCartValidation(
        async () => ({ data: menu }),
        () => cart,
      ),
    ).toBe('invalid')
    expect(cart.validateAgainst).toHaveBeenLastCalledWith(menu)
    expect(cart.hasInvalidLines()).toBe(true)
  })

  it('devuelve unknown si falla la descarga y no valida la bolsa', async () => {
    const cart = createCart()
    const fetchCatalog = vi.fn(async (): Promise<{ data: BusinessDetail }> => {
      throw new Error('No se pudo descargar el menú')
    })

    expect(await refreshCartValidation(fetchCatalog, () => cart)).toBe('unknown')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no descarga ni valida si la bolsa está vacía', async () => {
    const cart = createCart()
    cart.lines = []
    const fetchCatalog = vi.fn(async () => ({ data: catalog() }))

    expect(await refreshCartValidation(fetchCatalog, () => cart)).toBe('ok')
    expect(fetchCatalog).not.toHaveBeenCalled()
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no descarga ni valida si la bolsa no tiene negocio', async () => {
    const cart = createCart()
    cart.businessId = null
    const fetchCatalog = vi.fn(async () => ({ data: catalog() }))

    expect(await refreshCartValidation(fetchCatalog, () => cart)).toBe('ok')
    expect(fetchCatalog).not.toHaveBeenCalled()
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no valida si el menú descargado es de otro negocio', async () => {
    const cart = createCart()
    const menu = catalog()
    menu.business.id = 'other-restaurant'

    expect(
      await refreshCartValidation(
        async () => ({ data: menu }),
        () => cart,
      ),
    ).toBe('unknown')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no valida si la bolsa cambia de negocio durante la descarga', async () => {
    const cart = createCart()
    const fetchCatalog = vi.fn(async () => {
      cart.businessId = 'other-restaurant'
      return { data: catalog() }
    })

    expect(await refreshCartValidation(fetchCatalog, () => cart)).toBe('unknown')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no valida si la bolsa se vacía durante la descarga', async () => {
    const cart = createCart()
    const fetchCatalog = vi.fn(async () => {
      cart.lines = []
      return { data: catalog() }
    })

    expect(await refreshCartValidation(fetchCatalog, () => cart)).toBe('ok')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })
})
