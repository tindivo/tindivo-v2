import { FEATURED_MAX_ITEMS } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { featuredToggle } from '../utils'

describe('el tope de platos destacados en el panel (CA-CAT-02)', () => {
  it('CA-CAT-02 cuenta este plato y deja marcar mientras queda lugar', () => {
    expect(featuredToggle(2, false, FEATURED_MAX_ITEMS)).toEqual({ count: 2, blocked: false })
    expect(featuredToggle(FEATURED_MAX_ITEMS - 1, false, FEATURED_MAX_ITEMS).blocked).toBe(false)
  })

  it('CA-CAT-02 bloquea marcar el séptimo, pero deja quitar uno ya marcado', () => {
    expect(featuredToggle(FEATURED_MAX_ITEMS, false, FEATURED_MAX_ITEMS).blocked).toBe(true)
    // El plato ya está marcado: cuenta como uno de los seis y se puede desmarcar.
    expect(featuredToggle(FEATURED_MAX_ITEMS - 1, true, FEATURED_MAX_ITEMS)).toEqual({
      count: FEATURED_MAX_ITEMS,
      blocked: false,
    })
  })
})
