'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
 * Además de filtrar, aquí vive el manejo del scroll, que es la parte que se
 * nota cuando falta: los resultados sustituyen a la carta entera, así que la
 * página cambia de altura de golpe dos veces (al buscar y al cerrar) y el
 * navegador no tiene forma de adivinar dónde debería quedar el usuario.
 */
export function useMenuSearch(categories: Category[]) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const anchorRef = useRef<HTMLDivElement>(null)
  const scrollBeforeOpen = useRef<number | null>(null)

  const enabled = useMemo(() => shouldOfferSearch(categories), [categories])
  const terms = useMemo(() => parseTerms(query), [query])
  const active = open && terms.length > 0
  const hits: MenuHit[] = useMemo(
    () => (active ? searchMenu(categories, query) : []),
    [active, categories, query],
  )

  // Al aparecer los resultados la página se encoge. Si el usuario venía leyendo
  // «Bebidas», el navegador conserva su scroll y lo deja al final de una lista
  // que no ha visto empezar: ni el campo ni el primer resultado quedan a la
  // vista. Solo subimos; si ya estaba por encima del ancla, no lo movemos.
  useEffect(() => {
    if (!active) return
    const anchor = anchorRef.current
    if (!anchor) return
    if (window.scrollY > anchor.offsetTop) window.scrollTo({ top: anchor.offsetTop })
  }, [active])

  // Y al cerrar, devolverlo exactamente donde estaba leyendo. El efecto corre
  // tras el re-render, con la carta ya montada, así que la altura da para
  // llegar; hacerlo dentro del handler lo dejaría a mitad de camino.
  useEffect(() => {
    if (open || scrollBeforeOpen.current === null) return
    const back = scrollBeforeOpen.current
    scrollBeforeOpen.current = null
    window.scrollTo({ top: back })
  }, [open])

  // Cambiar de negocio a uno de carta corta no debe dejar el buscador abierto.
  useEffect(() => {
    if (!enabled) {
      setOpen(false)
      setQuery('')
    }
  }, [enabled])

  function openSearch() {
    scrollBeforeOpen.current = window.scrollY
    setOpen(true)
  }

  function closeSearch() {
    setQuery('')
    setOpen(false)
  }

  return { enabled, open, query, active, hits, anchorRef, setQuery, openSearch, closeSearch }
}
