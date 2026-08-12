import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Las tallas semánticas de `theme.css`, declaradas para `tailwind-merge`.
 *
 * SIN ESTO, `cn()` BORRA EL TAMAÑO DEL TEXTO EN SILENCIO.
 *
 * `tailwind-merge` resuelve conflictos por grupos de clases, y solo conoce las
 * tallas de fábrica (`text-sm`, `text-lg`…). Una `text-caption` le resulta
 * desconocida, así que la clasifica como COLOR de texto — es la misma forma,
 * `text-<algo>`— y entonces cualquier `text-ink-muted` en la misma llamada la
 * pisa y desaparece. El elemento se queda sin talla y hereda 16px.
 *
 * Es silencioso y confunde de verdad: el mismo par de clases funciona escrito a
 * pelo en un `className` (ahí no corre `twMerge`) y falla dentro de un `cn()`.
 * Se descubrió porque el detalle del cobro de la tarjeta del motorizado salía
 * más grande que la referencia teniendo los dos `text-caption`.
 *
 * Al añadir tallas nuevas a `@theme`, añadirlas también aquí.
 */
const THEME_FONT_SIZES = [
  'micro',
  'meta',
  'caption',
  'label',
  'body',
  'body-lg',
  'lead',
  'title',
  'display',
]

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: THEME_FONT_SIZES }],
    },
  },
})

/** Combina clases condicionales y resuelve conflictos de Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
