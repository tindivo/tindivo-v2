'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Autocompletado por teléfono (spec_ui_cajera.md PARTE B).
 *
 * El directorio tiene 701 direcciones curadas a lo largo del piloto: la cajera
 * escribe 9 dígitos y sale la dirección del cliente, sin volver a teclearla con
 * el teléfono en la oreja.
 *
 * LA REGLA QUE MANDA SOBRE TODAS (B6). Esto es una CONVENIENCIA, no una
 * dependencia. El cliente está esperando al teléfono: un formulario bloqueado
 * por una consulta opcional es peor que no tener autocompletado. Por eso hay
 * timeout de 5 s, caída a modo manual ante cualquier fallo, y NUNCA un estado
 * de carga indefinido ni un botón deshabilitado por culpa del lookup.
 */

/** Una dirección del directorio, tal como la devuelve el RPC. */
export interface DirectoryAddress {
  id: string
  phone: string
  customerName: string | null
  reference: string
  lat: number | null
  lng: number | null
  hasGps: boolean
  isDefault: boolean
  timesUsed: number
  lastUsedAt: string | null
}

/**
 * Los cuatro estados del spec (B2), más `error` para la degradación del B6.
 *
 * `idle` cubre "todavía no hay 9 dígitos": es el estado inicial y aquel al que
 * se vuelve si la cajera borra un dígito.
 */
export type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'single'; address: DirectoryAddress }
  | { status: 'multiple'; addresses: DirectoryAddress[] }
  | { status: 'empty' }
  | { status: 'error' }

/** Lo que el RPC devuelve, en snake_case. */
interface RpcRow {
  id: string
  phone: string
  customer_name: string | null
  reference: string
  lat: number | null
  lng: number | null
  has_gps: boolean
  is_default: boolean
  times_used: number
  last_used_at: string | null
}

const LOOKUP_TIMEOUT_MS = 5000

function toDirectoryAddress(row: RpcRow): DirectoryAddress {
  return {
    id: row.id,
    phone: row.phone,
    customerName: row.customer_name,
    reference: row.reference,
    lat: row.lat,
    lng: row.lng,
    hasGps: row.has_gps,
    isDefault: row.is_default,
    timesUsed: row.times_used,
    lastUsedAt: row.last_used_at,
  }
}

export function useAddressLookup(phone: string) {
  const [state, setState] = useState<LookupState>({ status: 'idle' })

  // El teléfono que disparó la consulta en vuelo. Sirve para descartar
  // respuestas viejas: si la cajera corrige un dígito mientras la primera
  // consulta viaja, la respuesta que llegue después podría pisar a la nueva y
  // autocompletar la dirección de OTRO cliente. Con el teléfono en la mano se
  // ignora todo lo que no corresponda al valor actual.
  const inFlightFor = useRef<string | null>(null)

  const clean = phone.replace(/\D/g, '')
  const isComplete = /^9\d{8}$/.test(clean)

  useEffect(() => {
    // B1: el disparo es al completar 9 dígitos EXACTOS. Ni antes (no hay nada
    // que buscar) ni por prefijo (el RPC lo rechaza a propósito: un LIKE
    // convertiría el directorio en un padrón consultable).
    if (!isComplete) {
      inFlightFor.current = null
      setState({ status: 'idle' })
      return
    }

    let cancelled = false
    inFlightFor.current = clean
    setState({ status: 'loading' })

    // El timeout es una CARRERA contra la consulta, no un `AbortController`:
    // supabase-js no expone abort en `.rpc()`, y lo que importa aquí no es
    // cancelar el viaje sino que la pantalla no se quede colgada. Si la
    // respuesta llega tarde, el guard de `cancelled` la descarta.
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), LOOKUP_TIMEOUT_MS),
    )

    const query = getSupabaseBrowser().rpc('search_address_directory', { p_phone: clean })

    Promise.race([query, timeout])
      .then((result) => {
        if (cancelled || inFlightFor.current !== clean) return

        if (result === 'timeout') {
          setState({ status: 'error' })
          return
        }

        const { data, error } = result as { data: RpcRow[] | null; error: unknown }
        if (error) {
          setState({ status: 'error' })
          return
        }

        const rows = (data ?? []).map(toDirectoryAddress)
        const [first] = rows

        // B2-d: sin resultados NO es un error. Es un cliente nuevo, que es la
        // mitad del negocio. El estado se llama `empty`, no `notFound`.
        if (!first) {
          setState({ status: 'empty' })
        } else if (rows.length === 1) {
          setState({ status: 'single', address: first })
        } else {
          setState({ status: 'multiple', addresses: rows })
        }
      })
      .catch(() => {
        if (cancelled || inFlightFor.current !== clean) return
        setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [clean, isComplete])

  /** Vuelve a `idle` sin tocar el teléfono. La usa el formulario cuando la
   *  cajera desvincula una dirección editando el texto (B4): el aviso de
   *  "usando dirección registrada" debe irse, pero la consulta no se repite. */
  const reset = useCallback(() => {
    inFlightFor.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, reset }
}
