import { describe, expect, it } from 'vitest'
import {
  buildProductPath,
  buildReservedMessage,
  buildSearchMessage,
  buildShareText,
  buildWhatsappMessage,
  buildWhatsappUrl,
  canTransitionStoreStatus,
  conditionScoreLabel,
  discountPercent,
  formatStorePrice,
  missingForPublish,
  parseStoreListParams,
  primaryBadge,
  type StoreProductCore,
  storeEventSchema,
  storeProductPatchSchema,
  storeSettingsSchema,
} from '../store'

const jacket: StoreProductCore = {
  code: 'TS-0012',
  slug: 'casaca-jean-m-ts-0012',
  title: 'Casaca jean talla M',
  price: 30,
  originalPrice: 60,
  isClearance: false,
  condition: 'used',
  conditionScore: 9,
  sizeLabel: 'M',
  status: 'available',
}

describe('formatStorePrice', () => {
  it('omite los decimales cuando son .00', () => {
    expect(formatStorePrice(30)).toBe('S/30')
    expect(formatStorePrice(30.0)).toBe('S/30')
  })
  it('muestra dos decimales cuando hay céntimos', () => {
    expect(formatStorePrice(29.5)).toBe('S/29.50')
    expect(formatStorePrice(2.25)).toBe('S/2.25')
  })
})

describe('discountPercent', () => {
  it('redondea el porcentaje', () => {
    expect(discountPercent(30, 60)).toBe(50)
    expect(discountPercent(20, 30)).toBe(33)
  })
  it('no hay descuento si el original no es mayor que el precio', () => {
    expect(discountPercent(30, 30)).toBeNull()
    expect(discountPercent(30, 20)).toBeNull()
    expect(discountPercent(30, null)).toBeNull()
  })
  it('un descuento que redondea a 0 no se muestra', () => {
    expect(discountPercent(99.9, 100)).toBeNull()
  })
})

describe('conditionScoreLabel', () => {
  it.each([
    [10, 'Impecable'],
    [9, 'Muy buen estado'],
    [8, 'Muy buen estado'],
    [7, 'Buen estado, con uso'],
    [6, 'Buen estado, con uso'],
    [5, 'Con detalles visibles (ver fotos)'],
    [1, 'Con detalles visibles (ver fotos)'],
  ])('%i → %s', (score, label) => {
    expect(conditionScoreLabel(score)).toBe(label)
  })
})

describe('primaryBadge · una sola insignia por tarjeta', () => {
  it('el descuento gana a todo', () => {
    expect(primaryBadge({ ...jacket, isClearance: true })).toEqual({
      kind: 'discount',
      percent: 50,
    })
  })
  it('sin descuento, Remate', () => {
    expect(primaryBadge({ ...jacket, originalPrice: null, isClearance: true })).toEqual({
      kind: 'clearance',
    })
  })
  it('sin descuento ni remate, Nuevo si viene con etiqueta', () => {
    expect(
      primaryBadge({
        ...jacket,
        originalPrice: null,
        condition: 'new_with_tag',
        conditionScore: null,
      }),
    ).toEqual({ kind: 'new' })
  })
  it('un usado sin descuento ni remate muestra su estado', () => {
    expect(primaryBadge({ ...jacket, originalPrice: null })).toEqual({ kind: 'score', score: 9 })
  })
  it('nuevo sin uso no lleva insignia', () => {
    expect(
      primaryBadge({
        ...jacket,
        originalPrice: null,
        condition: 'new_unused',
        conditionScore: null,
      }),
    ).toBeNull()
  })
  it('reservado reemplaza a la insignia normal', () => {
    expect(primaryBadge({ ...jacket, status: 'reserved' })).toEqual({ kind: 'reserved' })
  })
  it('vendido reemplaza a la insignia normal', () => {
    expect(primaryBadge({ ...jacket, status: 'sold' })).toEqual({ kind: 'sold' })
  })
})

describe('missingForPublish · el botón dice qué falta', () => {
  const ready = { ...jacket, categoryId: 'cat-1' }
  it('listo → null', () => {
    expect(missingForPublish(ready, 1)).toBeNull()
  })
  it('sin fotos', () => {
    expect(missingForPublish(ready, 0)).toBe('Falta al menos una foto')
  })
  it('sin título', () => {
    expect(missingForPublish({ ...ready, title: '  ' }, 1)).toBe('Falta el título')
  })
  it('sin precio', () => {
    expect(missingForPublish({ ...ready, price: null }, 1)).toBe('Falta el precio')
  })
  it('sin categoría', () => {
    expect(missingForPublish({ ...ready, categoryId: null }, 1)).toBe('Falta la categoría')
  })
  it('sin condición', () => {
    expect(missingForPublish({ ...ready, condition: null }, 1)).toBe('Falta la condición')
  })
  it('usado sin estado', () => {
    expect(missingForPublish({ ...ready, conditionScore: null }, 1)).toBe(
      'Falta el estado del 1 al 10',
    )
  })
  it('nuevo no necesita estado', () => {
    expect(
      missingForPublish({ ...ready, condition: 'new_unused', conditionScore: null }, 1),
    ).toBeNull()
  })
  it('reporta la primera que falta, en el orden del formulario', () => {
    expect(missingForPublish({ ...ready, title: null, price: null }, 0)).toBe(
      'Falta al menos una foto',
    )
  })
})

describe('canTransitionStoreStatus', () => {
  it('borrador solo sale publicando', () => {
    expect(canTransitionStoreStatus('draft', 'available')).toBe(true)
    expect(canTransitionStoreStatus('draft', 'sold')).toBe(false)
    expect(canTransitionStoreStatus('draft', 'reserved')).toBe(false)
  })
  it('nada vuelve a borrador', () => {
    for (const from of ['available', 'reserved', 'sold', 'hidden'] as const) {
      expect(canTransitionStoreStatus(from, 'draft')).toBe(false)
    }
  })
  it('los publicados se mueven libremente entre sí (incluye revertir un vendido)', () => {
    expect(canTransitionStoreStatus('available', 'reserved')).toBe(true)
    expect(canTransitionStoreStatus('available', 'sold')).toBe(true)
    expect(canTransitionStoreStatus('reserved', 'available')).toBe(true)
    expect(canTransitionStoreStatus('sold', 'available')).toBe(true)
    expect(canTransitionStoreStatus('hidden', 'available')).toBe(true)
  })
  it('mismo estado no es una transición', () => {
    expect(canTransitionStoreStatus('available', 'available')).toBe(false)
  })
})

describe('mensajes de WhatsApp', () => {
  it('compra', () => {
    expect(buildWhatsappMessage(jacket, 'https://tindivo.com/store/casaca-jean-m-ts-0012')).toBe(
      'Hola Tindivo, quiero: Casaca jean talla M (S/30) — código TS-0012. https://tindivo.com/store/casaca-jean-m-ts-0012 ¿Sigue disponible?',
    )
  })
  it('reservado', () => {
    expect(buildReservedMessage(jacket)).toBe(
      'Hola Tindivo, vi que TS-0012 está reservado. Avísame si se libera.',
    )
  })
  it('búsqueda sin resultados incluye lo buscado', () => {
    expect(buildSearchMessage('cargador solar')).toBe(
      'Hola Tindivo, busco: cargador solar. ¿Me avisan si llega?',
    )
  })
  it('la URL codifica el mensaje y usa solo dígitos del número', () => {
    const url = buildWhatsappUrl('+51 906 550 166', 'Hola & ¿qué tal?')
    expect(url).toBe('https://wa.me/51906550166?text=Hola%20%26%20%C2%BFqu%C3%A9%20tal%3F')
  })
})

describe('links y texto para redes', () => {
  it('el path lleva ref solo si es una fuente conocida', () => {
    expect(buildProductPath('casaca-jean-m-ts-0012', 'fb')).toBe(
      '/store/casaca-jean-m-ts-0012?ref=fb',
    )
    expect(buildProductPath('casaca-jean-m-ts-0012')).toBe('/store/casaca-jean-m-ts-0012')
  })
  it('texto para redes con descuento y estado', () => {
    expect(buildShareText(jacket, 'https://tindivo.com', 'fb')).toBe(
      'Casaca jean talla M · Estado 9/10 · S/30 (antes S/60) · Entrega en San Jacinto, pagas al recibir · https://tindivo.com/store/casaca-jean-m-ts-0012?ref=fb',
    )
  })
  it('sin precio original ni estado omite esas partes', () => {
    expect(
      buildShareText(
        { ...jacket, originalPrice: null, condition: 'new_unused', conditionScore: null },
        'https://tindivo.com',
      ),
    ).toBe(
      'Casaca jean talla M · S/30 · Entrega en San Jacinto, pagas al recibir · https://tindivo.com/store/casaca-jean-m-ts-0012',
    )
  })
})

describe('parseStoreListParams · la URL del comprador', () => {
  it('traduce la URL en español a filtros', () => {
    expect(
      parseStoreListParams({
        q: ' casaca ',
        categoria: 'ropa',
        condicion: 'segunda',
        orden: 'precio_asc',
      }),
    ).toEqual({
      q: 'casaca',
      category: 'ropa',
      condition: 'used',
      order: 'price_asc',
    })
  })
  it('valores desconocidos caen al valor por defecto', () => {
    expect(parseStoreListParams({ condicion: 'x', orden: 'y' })).toEqual({
      q: null,
      category: null,
      condition: null,
      order: 'recent',
    })
  })
  it('nuevo y todo', () => {
    expect(parseStoreListParams({ condicion: 'nuevo' }).condition).toBe('new')
    expect(parseStoreListParams({ condicion: 'todo' }).condition).toBeNull()
  })
  it('una búsqueda vacía es null y se recorta a 80', () => {
    expect(parseStoreListParams({ q: '   ' }).q).toBeNull()
    expect(parseStoreListParams({ q: 'a'.repeat(200) }).q).toHaveLength(80)
  })
})

describe('storeProductPatchSchema · autosave de campos', () => {
  it('acepta un parche parcial', () => {
    expect(storeProductPatchSchema.safeParse({ title: 'Casaca' }).success).toBe(true)
    expect(storeProductPatchSchema.safeParse({}).success).toBe(true)
  })
  it('rechaza título de más de 60', () => {
    expect(storeProductPatchSchema.safeParse({ title: 'a'.repeat(61) }).success).toBe(false)
  })
  it('rechaza descripción de más de 600', () => {
    expect(storeProductPatchSchema.safeParse({ description: 'a'.repeat(601) }).success).toBe(false)
  })
  it('precio debe ser positivo', () => {
    expect(storeProductPatchSchema.safeParse({ price: 0 }).success).toBe(false)
    expect(storeProductPatchSchema.safeParse({ price: -5 }).success).toBe(false)
  })
  it('estado entre 1 y 10', () => {
    expect(storeProductPatchSchema.safeParse({ conditionScore: 0 }).success).toBe(false)
    expect(storeProductPatchSchema.safeParse({ conditionScore: 11 }).success).toBe(false)
    expect(storeProductPatchSchema.safeParse({ conditionScore: 7 }).success).toBe(true)
  })
  it('el foco de portada va de 0 a 1', () => {
    expect(storeProductPatchSchema.safeParse({ coverFocusX: 1.2 }).success).toBe(false)
    expect(storeProductPatchSchema.safeParse({ coverFocusX: 0.3, coverFocusY: 0.7 }).success).toBe(
      true,
    )
  })
  it('no deja tocar status ni code por el parche', () => {
    const r = storeProductPatchSchema.safeParse({ title: 'x', status: 'sold', code: 'TS-1' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ title: 'x' })
  })
  it('un campo vacío se normaliza a null para poder borrarlo', () => {
    const r = storeProductPatchSchema.safeParse({ description: '', sizeLabel: '  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ description: null, sizeLabel: null })
  })
})

describe('storeEventSchema', () => {
  const base = { type: 'view_product', sessionId: 'abcdefgh-1234' }
  it('acepta un evento válido', () => {
    expect(storeEventSchema.safeParse(base).success).toBe(true)
  })
  it('rechaza tipos desconocidos', () => {
    expect(storeEventSchema.safeParse({ ...base, type: 'hack' }).success).toBe(false)
  })
  it('ref desconocido se descarta en vez de fallar', () => {
    const r = storeEventSchema.safeParse({ ...base, ref: 'otra_red' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.ref).toBeNull()
  })
  it('ref conocido se conserva', () => {
    const r = storeEventSchema.safeParse({ ...base, ref: 'wa_estado' })
    expect(r.success && r.data.ref).toBe('wa_estado')
  })
  it('metadata anónimo con tope: uno enorme se rechaza', () => {
    expect(storeEventSchema.safeParse({ ...base, metadata: { a: 'x'.repeat(2000) } }).success).toBe(
      false,
    )
    expect(storeEventSchema.safeParse({ ...base, metadata: { a: 'ok' } }).success).toBe(true)
  })
  it('exige sessionId razonable', () => {
    expect(storeEventSchema.safeParse({ ...base, sessionId: 'x' }).success).toBe(false)
  })
})

describe('storeSettingsSchema', () => {
  const ok = { whatsappNumber: '51906550166', deliveryMin: 2, deliveryMax: 2.5, deliveryText: null }
  it('acepta los valores iniciales', () => {
    expect(storeSettingsSchema.safeParse(ok).success).toBe(true)
  })
  it('el mínimo no puede superar al máximo', () => {
    expect(storeSettingsSchema.safeParse({ ...ok, deliveryMin: 3 }).success).toBe(false)
  })
  it('el número se normaliza a dígitos y exige código de país', () => {
    const r = storeSettingsSchema.safeParse({ ...ok, whatsappNumber: '+51 906 550 166' })
    expect(r.success && r.data.whatsappNumber).toBe('51906550166')
    expect(storeSettingsSchema.safeParse({ ...ok, whatsappNumber: '906550166' }).success).toBe(
      false,
    )
  })
})
