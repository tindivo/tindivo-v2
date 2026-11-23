import { describe, expect, it } from 'vitest'
import { FEATURED_DEFAULT_TITLE, FEATURED_MAX_ITEMS, featuredSection } from '../featured-section'

const dish = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  is_featured: true,
  is_available: true,
  thumbnail_url: `https://x/${id}.webp`,
  image_url: null,
  ...patch,
})

describe('la sección «Destacados» que arma el servidor (CA-CAT-02)', () => {
  it('CA-CAT-02 usa el nombre que puso el restaurante y deja los platos en el orden de la carta', () => {
    const section = featuredSection(
      [[dish('a'), dish('b', { is_featured: false })], [dish('c')]],
      'Los más pedidos',
    )
    expect(section).toEqual({ title: 'Los más pedidos', item_ids: ['a', 'c'] })
  })

  it('CA-CAT-02 sin nombre usa «Destacados»', () => {
    expect(featuredSection([[dish('a')]], null)?.title).toBe(FEATURED_DEFAULT_TITLE)
    expect(featuredSection([[dish('a')]], '   ')?.title).toBe(FEATURED_DEFAULT_TITLE)
  })

  it('CA-CAT-02 sin ningún plato destacado disponible no hay sección', () => {
    expect(featuredSection([[dish('a', { is_available: false })]], 'X')).toBeNull()
    expect(featuredSection([[dish('a', { is_featured: false })]], 'X')).toBeNull()
  })

  it('CA-CAT-02 un plato sin foto no entra: la sección es de platos con foto', () => {
    const noPhoto = dish('a', { thumbnail_url: null, image_url: null })
    expect(featuredSection([[noPhoto]], null)).toBeNull()
    expect(
      featuredSection([[dish('a', { thumbnail_url: null, image_url: 'https://x/a.jpg' })]], null),
    ).not.toBeNull()
  })

  it('CA-CAT-02 sirve como máximo FEATURED_MAX_ITEMS platos', () => {
    const many = Array.from({ length: FEATURED_MAX_ITEMS + 3 }, (_, i) => dish(`d${i}`))
    expect(featuredSection([many], null)?.item_ids).toHaveLength(FEATURED_MAX_ITEMS)
  })
})
