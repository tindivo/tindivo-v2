'use client'

import { useRef } from 'react'

/**
 * Abre una petición y devuelve cómo preguntar si sigue siendo la última.
 */
export type AbrirPeticion = () => () => boolean

/**
 * QUIÉN GANA CUANDO HAY VARIAS PETICIONES EN EL AIRE.
 *
 * El patrón `const load = useCallback(..., [param])` + `useEffect(load)` manda
 * una petición por cada valor del parámetro y escribe con la que llegue. Gana
 * LA ÚLTIMA EN RESPONDER, no la última en pedirse, y eso no es una carrera de
 * laboratorio cuando el parámetro es un rango de fechas: cambiarlo dispara dos
 * peticiones —el selector son dos inputs, así que «del 3 al 9 de marzo» manda
 * antes «del 3 de marzo al fin viejo»— y la intermedia suele ser mucho más
 * pesada que la buena, así que llega después.
 *
 * El resultado es la peor forma de estar mal: la cabecera y los controles dicen
 * lo que pediste, y los datos son de otra ventana. No hay nada en pantalla que
 * lo delate. Pasaba en /rendimiento y estaba a punto de pasar en el historial.
 *
 * ── POR QUÉ ESTO Y NO EL `let vivo = true` DE SIEMPRE ────────────────────────
 *
 * `useReviews` y `useReviewsList` resuelven lo mismo con la bandera y el
 * cleanup del efecto, que es más corto y perfectamente correcto — NO se han
 * tocado. Pero solo sirve cuando la única forma de pedir es el efecto: el
 * cleanup lo dispara React al cambiar las deps, y no sabe nada de un `reload()`
 * que alguien llame a mano. Los tres hooks que usan este testigo exponen
 * `reload`, y ahí la bandera dejaría fuera justo el camino manual.
 *
 * Que convivan los dos idiomas es deliberado, y la línea que los separa es esa:
 * ¿se puede pedir por fuera del efecto?
 */
export function crearTestigoDeVigencia(): AbrirPeticion {
  let ultima = 0
  return () => {
    const mia = ++ultima
    return () => mia === ultima
  }
}

/**
 * El testigo, atado a la vida del componente.
 *
 * Se crea una sola vez y NO se recrea al cambiar nada: si se recreara, el
 * contador volvería a cero y una respuesta vieja podría creerse vigente, que es
 * exactamente lo que esto viene a impedir.
 */
export function useLatestRequest(): AbrirPeticion {
  const testigo = useRef<AbrirPeticion | null>(null)
  const actual = testigo.current ?? crearTestigoDeVigencia()
  testigo.current = actual
  return actual
}
