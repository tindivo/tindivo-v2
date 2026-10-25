import { describe, expect, it, vi } from 'vitest'
import type { BusinessDetail } from '../../features/catalog/types'
import type { CartLine } from '../cart'
import { isCartUnchanged, refreshCartValidation } from '../cart-refresh'
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

function deferredCatalog() {
  let resolve: ((response: { data: BusinessDetail }) => void) | undefined
  let reject: ((error: Error) => void) | undefined
  const request = new Promise<{ data: BusinessDetail }>((resolveRequest, rejectRequest) => {
    resolve = resolveRequest
    reject = rejectRequest
  })
  return {
    fetchCatalog: vi.fn(() => request),
    resolve(menu: BusinessDetail) {
      if (!resolve) throw new Error('La descarga no tiene una función para resolverla')
      resolve({ data: menu })
    },
    reject(error: Error) {
      if (!reject) throw new Error('La descarga no tiene una función para rechazarla')
      reject(error)
    },
  }
}

describe('refrescar la validación de la bolsa antes de pagar', () => {
  it('devuelve ok y valida la bolsa contra el menú recién descargado', async () => {
    const cart = createCart()
    const menu = catalog()
    const fetchCatalog = vi.fn(async () => ({ data: menu }))

    expect(await refreshCartValidation(fetchCatalog, () => cart, { ...cart })).toBe('ok')
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
        { ...cart },
      ),
    ).toBe('invalid')
    expect(cart.validateAgainst).toHaveBeenLastCalledWith(menu)
    expect(cart.hasInvalidLines()).toBe(true)
  })

  it('devuelve unknown si falla la descarga y no valida la bolsa', async () => {
    const cart = createCart()
    const download = deferredCatalog()
    const result = refreshCartValidation(download.fetchCatalog, () => cart, { ...cart })

    download.reject(new Error('No se pudo descargar el menú'))
    expect(await result).toBe('unknown')
    expect(download.fetchCatalog).toHaveBeenCalledExactlyOnceWith('restaurant')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no descarga ni valida si la bolsa está vacía', async () => {
    const cart = createCart()
    cart.lines = []
    const fetchCatalog = vi.fn(async () => ({ data: catalog() }))

    expect(await refreshCartValidation(fetchCatalog, () => cart, { ...cart })).toBe('ok')
    expect(fetchCatalog).not.toHaveBeenCalled()
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('no descarga ni valida si la bolsa no tiene negocio', async () => {
    const cart = createCart()
    cart.businessId = null
    const fetchCatalog = vi.fn(async () => ({ data: catalog() }))

    expect(await refreshCartValidation(fetchCatalog, () => cart, { ...cart })).toBe('ok')
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
        { ...cart },
      ),
    ).toBe('unknown')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it.each([
    {
      change: 'cambian las líneas del mismo negocio',
      update: (cart: ReturnType<typeof createCart>) => {
        cart.lines = [{ ...line, quantity: 2 }]
      },
    },
    {
      change: 'la bolsa se vacía',
      update: (cart: ReturnType<typeof createCart>) => {
        cart.lines = []
        cart.businessId = null
      },
    },
    {
      change: 'la bolsa cambia de negocio',
      update: (cart: ReturnType<typeof createCart>) => {
        cart.businessId = 'other-restaurant'
      },
    },
  ])('devuelve changed si $change durante la descarga', async ({ update }) => {
    const cart = createCart()
    const download = deferredCatalog()
    const result = refreshCartValidation(download.fetchCatalog, () => cart, { ...cart })

    expect(download.fetchCatalog).toHaveBeenCalledExactlyOnceWith('restaurant')
    update(cart)
    download.resolve(catalog())

    expect(await result).toBe('changed')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it.each([
    'lines',
    'businessId',
  ] as const)('devuelve changed sin descargar si %s ya difería de la captura', async (changedField) => {
    const cart = createCart()
    const expected = { ...cart }
    if (changedField === 'lines') cart.lines = [...cart.lines]
    else cart.businessId = 'other-restaurant'
    const fetchCatalog = vi.fn(async () => ({ data: catalog() }))

    expect(await refreshCartValidation(fetchCatalog, () => cart, expected)).toBe('changed')
    expect(fetchCatalog).not.toHaveBeenCalled()
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })

  it('devuelve changed si falla la descarga después de cambiar las líneas', async () => {
    const cart = createCart()
    const download = deferredCatalog()
    const result = refreshCartValidation(download.fetchCatalog, () => cart, { ...cart })

    cart.lines = [...cart.lines]
    download.reject(new Error('No se pudo descargar el menú'))

    expect(await result).toBe('changed')
    expect(cart.validateAgainst).not.toHaveBeenCalled()
  })
})

describe('comprobar que la bolsa sigue siendo la captura esperada', () => {
  it('acepta el mismo negocio y el mismo arreglo de líneas', () => {
    const expected = { businessId: 'restaurant', lines: [line] }

    expect(isCartUnchanged(expected, { ...expected })).toBe(true)
  })

  it('rechaza un arreglo nuevo aunque tenga el mismo contenido', () => {
    const expected = { businessId: 'restaurant', lines: [line] }

    expect(isCartUnchanged(expected, { ...expected, lines: [...expected.lines] })).toBe(false)
  })

  it('rechaza otro negocio aunque conserve el mismo arreglo', () => {
    const expected = { businessId: 'restaurant', lines: [line] }

    expect(isCartUnchanged(expected, { ...expected, businessId: 'other-restaurant' })).toBe(false)
  })
})
