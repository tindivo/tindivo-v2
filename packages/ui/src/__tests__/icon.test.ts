import { describe, expect, it } from 'vitest'
import { Icon } from '../primitives/icon'

/**
 * Lo que se protege aquí es que el nombre del icono **no vuelva al texto del
 * elemento**.
 *
 * Material Symbols dibuja el glifo con una ligadura, así que lo natural es
 * escribir `<span>schedule</span>` y dejar que la fuente lo sustituya. Se ve
 * bien y por eso nadie lo mira dos veces — pero la palabra está de verdad en el
 * DOM. El 2026-08-18 Google publicó el resultado de la portada así:
 *
 *   «...para disfrutar en un gran ambiente.Cerradoschedule 25–50 minlocal_shipping»
 *
 * Ocho nombres de icono entre las frases del escaparate del sitio. La regresión
 * es silenciosa —nada se ve mal en pantalla— y por eso necesita un test.
 *
 * Se inspecciona el elemento que devuelve el componente, sin render: basta para
 * comprobar dónde acaba el nombre, que es justo lo que se rompió.
 */

interface IconElement {
  props: {
    children?: unknown
    style: Record<string, string>
    'aria-label': string
    role: string
  }
}

const render = (props: Parameters<typeof Icon>[0]) => Icon(props) as unknown as IconElement

describe('Icon', () => {
  it('no pone el nombre como texto del elemento', () => {
    const el = render({ name: 'schedule' })
    // Sin hijos no hay nada que un crawler pueda leer como palabra.
    expect(el.props.children).toBeUndefined()
  })

  it('pasa el nombre por la custom property que lee el ::before', () => {
    const el = render({ name: 'local_shipping' })
    expect(el.props.style['--icon-glyph']).toBe('"local_shipping"')
  })

  it('mantiene el nombre accesible por aria-label, con guiones bajos legibles', () => {
    // La accesibilidad NO puede depender del contenido generado por CSS, que
    // los lectores de pantalla tratan de forma dispar.
    const el = render({ name: 'local_shipping' })
    expect(el.props['aria-label']).toBe('local shipping')
    expect(el.props.role).toBe('img')
  })

  it('respeta un aria-label explícito', () => {
    const el = render({ name: 'schedule', 'aria-label': 'Tiempo de entrega' })
    expect(el.props['aria-label']).toBe('Tiempo de entrega')
  })

  it('sanea el nombre: una comilla cerraría la cadena CSS', () => {
    // `name` llega a veces de un view-model, no de un literal. Sin saneado,
    // `"; color: red; content: "` se saldría del `content` y seguiría como CSS.
    const el = render({ name: 'a"; color: red; content: "b' })
    const glifo = el.props.style['--icon-glyph'] ?? ''
    expect(glifo).toBe('"acolorredcontentb"')
    expect(glifo).not.toContain(';')
    // Exactamente dos comillas: las que abren y cierran la cadena, ninguna más.
    expect((glifo.match(/"/g) ?? []).length).toBe(2)
  })

  it('sigue fijando los cuatro ejes de la fuente variable', () => {
    // Sin los cuatro, Material Symbols cae a `.notdef` y se pinta un cuadro.
    const el = render({ name: 'schedule', filled: true, weight: 500 })
    expect(el.props.style.fontVariationSettings).toBe("'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24")
  })
})
