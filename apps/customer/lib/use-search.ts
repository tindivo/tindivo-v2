'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

export interface SearchBusiness {
  id: string
  /** Identificador legible de la URL pública. Ver migración 0165. */
  slug: string
  name: string
  tagline: string | null
  accent_color: string
  logo_url: string | null
  primary_capability: string
  estimated_eta_min: number
  estimated_eta_max: number
}

export interface SearchItem {
  id: string
  business_id: string
  /** Slug del negocio dueño del plato: el enlace del resultado va directo ahí. */
  business_slug: string
  business_name: string
  name: string
  description: string | null
  base_price: number
  image_url: string | null
  image_hue: number | null
}

export interface SearchResults {
  businesses: SearchBusiness[]
  items: SearchItem[]
}

const DEBOUNCE_MS = 300
const MIN_CHARS = 2

/**
 * Búsqueda del catálogo (negocios + platos) con debounce y cancelación.
 * El AbortController cubre a la vez el debounce cancelado y las respuestas
 * fuera de orden. La insensibilidad a mayúsculas/tildes es server-side.
 */
export function useCatalogSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const q = query.trim()
  const active = q.length >= MIN_CHARS

  useEffect(() => {
    abortRef.current?.abort()
    if (!active) {
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }
    // Loading inmediato (skeleton) aunque el fetch espere el debounce.
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => {
      api
        .get<ApiEnvelope<SearchResults>>(
          `/public/search?q=${encodeURIComponent(q)}`,
          controller.signal,
        )
        .then((res) => {
          if (controller.signal.aborted) return
          setResults(res.data)
          setLoading(false)
        })
        .catch(() => {
          if (controller.signal.aborted) return // debounce/carrera: ignorar
          setResults(null)
          setLoading(false)
          setError('No se pudo buscar. Intenta de nuevo.')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  return { query, setQuery, active, loading, results, error }
}
