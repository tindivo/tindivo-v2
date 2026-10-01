import { describe, expect, it } from 'vitest'
import { courierCategory } from '../courier-category'

describe('categoría de una entrega', () => {
  it('reconoce el texto que deja el botón del cliente', () => {
    expect(courierCategory('Comida')).toEqual({ label: 'Comida', icon: 'fastfood', detail: null })
    expect(courierCategory('Documentos').label).toBe('Documentos')
  })

  it('si el cliente añadió algo, lo conserva como detalle', () => {
    expect(courierCategory('Comida, un táper de arroz').detail).toBe('un táper de arroz')
  })

  it('lo escrito a mano es «Otro» y se enseña tal cual', () => {
    expect(courierCategory('DNI')).toEqual({ label: 'Otro', icon: 'inventory_2', detail: 'DNI' })
  })

  it('no confunde una palabra que solo empieza igual', () => {
    expect(courierCategory('Comidas típicas').label).toBe('Otro')
  })

  it('todos los iconos están en la fuente recortada', async () => {
    const { readFileSync } = await import('node:fs')
    const subset = new Set(
      readFileSync(new URL('../../public/fonts/icons.txt', import.meta.url), 'utf8').split(/\s+/),
    )
    for (const t of ['Comida', 'Documentos', 'Medicinas', 'Ropa', 'x']) {
      expect(subset.has(courierCategory(t).icon)).toBe(true)
    }
  })
})
