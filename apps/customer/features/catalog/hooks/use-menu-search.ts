'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type MenuHit,
  parseTerms,
  searchMenu,
  shouldOfferSearch,
} from '@/features/catalog/lib/menu-search'
import type { Category } from '@/features/catalog/types'

/**
 * Estado de la búsqueda dentro de una carta.
 *
 * El campo ya no se abre ni se cierra: vive siempre en la barra fija, como el
 * de la portada. Lo que sí aparece y desaparece es lo que ocupa el sitio de la
 * carta, y son dos cosas distintas:
 *
 * - `active`   — hay términos escritos: se ven los resultados.
 * - `suggesting` — el campo tiene el foco y está vacío: se ven las secciones
 *   como sugerencia, para que un campo en blanco no obligue a adivinar qué
 *   palabras conoce esta carta.
 *
 * Las dos sustituyen la carta entera, así que la página cambia de altura de
 * golpe y el navegador no tiene forma de adivinar dónde debería quedar el
 * usuario. Eso lo resuelve `replacing`, que es la unión de las dos: guarda el
 * scroll al entrar y lo devuelve al salir.
 */
export function useMenuSearch(categories: Category[]) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const scrollBefore = useRef<number | null>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enabled = useMemo(() => shouldOfferSearch(categories), [categories])
  const terms = useMemo(() => parseTerms(query), [query])
  const active = terms.length > 0
  const suggesting = focused && !active
  const replacing = active || suggesting
  const hits: MenuHit[] = useMemo(
    () => (active ? searchMenu(categories, query) : []),
    [active, categories, query],
  )

  /**
   * Al aparecer los resultados la página se encoge. Si el usuario venía leyendo
   * «Bebidas», el navegador conserva su scroll y lo deja al final de una lista
   * que no ha visto empezar. Al salir, lo devolvemos donde estaba leyendo.
   *
   * Subir es condicional —si ya estaba por encima del ancla no lo movemos—,
   * pero volver no: el efecto corre tras el re-render, con la carta ya montada,
   * así que la altura da para llegar.
   */
  useEffect(() => {
    if (replacing) {
      if (scrollBefore.current !== null) return
      scrollBefore.current = window.scrollY
      const anchor = anchorRef.current
      if (anchor && window.scrollY > anchor.offsetTop) window.scrollTo({ top: anchor.offsetTop })
      return
    }
    if (scrollBefore.current === null) return
    const back = scrollBefore.current
    scrollBefore.current = null
    window.scrollTo({ top: back })
  }, [replacing])

  // Cambiar de negocio a uno de carta corta no debe dejar texto escrito.
  useEffect(() => {
    if (!enabled) {
      setQuery('')
      setFocused(false)
    }
  }, [enabled])

  useEffect(() => () => clearBlurTimer(blurTimer), [])

  const onFocus = useCallback(() => {
    clearBlurTimer(blurTimer)
    setFocused(true)
  }, [])

  /**
   * El retardo deja pasar el toque en una sugerencia: sin él, el `blur` del
   * campo desmonta el panel antes de que el clic llegue a su destino y el
   * usuario toca una sección que ya no existe.
   */
  const onBlur = useCallback(() => {
    clearBlurTimer(blurTimer)
    blurTimer.current = setTimeout(() => setFocused(false), 180)
  }, [])

  const clear = useCallback(() => {
    clearBlurTimer(blurTimer)
    setQuery('')
    setFocused(false)
  }, [])

  /**
   * Salir de la búsqueda PARA IR a una sección concreta. Se diferencia de
   * `clear` en que suelta el scroll guardado: si no, el efecto de arriba
   * devolvería al usuario donde estaba antes de buscar y desharía el salto.
   */
  const closeForJump = useCallback(() => {
    clearBlurTimer(blurTimer)
    scrollBefore.current = null
    setQuery('')
    setFocused(false)
  }, [])

  return {
    enabled,
    query,
    active,
    suggesting,
    replacing,
    hits,
    anchorRef,
    setQuery,
    onFocus,
    onBlur,
    clear,
    closeForJump,
  }
}

function clearBlurTimer(ref: { current: ReturnType<typeof setTimeout> | null }) {
  if (ref.current) clearTimeout(ref.current)
  ref.current = null
}
