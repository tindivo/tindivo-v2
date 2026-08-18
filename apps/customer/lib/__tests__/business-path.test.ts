import { describe, expect, it } from 'vitest'
import { businessPath } from '../business-path'

/**
 * El caso que importa es el de en medio: `apps/api` y `apps/customer` son
 * proyectos de Vercel distintos y no despliegan a la vez, así que existe una
 * ventana real en la que esta app pide el catálogo a una API que todavía no
 * incluye `slug` en sus columnas públicas.
 *
 * Antes de este helper, esa ventana producía `/negocio/undefined` en TODAS las
 * tarjetas: la portada pintaba bien y no se podía entrar a ningún negocio. El
 * tipo decía `slug: string` y no impedía nada, porque el hueco aparece en
 * runtime y viene del otro lado del cable.
 */
describe('businessPath', () => {
  it('usa el slug cuando está', () => {
    expect(businessPath({ slug: 'pizza-priamo', id: 'be47c407-37c2-4ad0-b0bc-7ed24b162cf7' })).toBe(
      '/negocio/pizza-priamo',
    )
  })

  it('cae al uuid cuando la API todavía no manda slug', () => {
    const id = 'be47c407-37c2-4ad0-b0bc-7ed24b162cf7'
    // Las tres formas en que puede llegar el hueco: ausente (API vieja, que no
    // incluye la columna), null (columna presente y vacía) y '' (defensivo).
    expect(businessPath({ id })).toBe(`/negocio/${id}`)
    expect(businessPath({ slug: null, id })).toBe(`/negocio/${id}`)
    expect(businessPath({ slug: '', id })).toBe(`/negocio/${id}`)
  })

  it('nunca produce la cadena "undefined" en la ruta', () => {
    // La regresión concreta, escrita como aserción: cualquier futuro cambio que
    // vuelva a interpolar el slug crudo la rompe aquí y no en producción.
    const rutas = [
      businessPath({ id: 'abc' }),
      businessPath({ slug: undefined, id: 'abc' }),
      businessPath({ slug: null, id: 'abc' }),
    ]
    for (const ruta of rutas) {
      expect(ruta).not.toContain('undefined')
      expect(ruta).not.toContain('null')
    }
  })
})
