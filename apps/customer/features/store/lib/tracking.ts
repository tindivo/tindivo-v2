'use client'

import { STORE_REFS, type StoreEventType, type StoreRef } from '@tindivo/contracts'
import { API_BASE } from './api'

/**
 * Medición del experimento (PRD §9). Anónima: un `sessionId` aleatorio que vive
 * en el navegador y la fuente del link (`?ref=fb`). Ni cuentas ni datos
 * personales. Todo está envuelto en try/catch: el almacenamiento puede estar
 * bloqueado (modo privado) y medir NUNCA debe romper la tienda.
 */

const SID_KEY = 'tdv-store-sid'
const REF_KEY = 'tdv-store-ref'
let memorySid: string | null = null

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function getSessionId(): string {
  try {
    const stored = window.localStorage.getItem(SID_KEY)
    if (stored) return stored
    const fresh = randomId()
    window.localStorage.setItem(SID_KEY, fresh)
    return fresh
  } catch {
    memorySid ??= randomId()
    return memorySid
  }
}

/**
 * La fuente del link: se captura de `?ref=` una vez y se conserva toda la
 * sesión, porque el comprador entra por un producto y recorre más antes de
 * escribir. Solo acepta fuentes conocidas.
 */
export function captureRef(): StoreRef | null {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get('ref')
    if (fromUrl && (STORE_REFS as readonly string[]).includes(fromUrl)) {
      window.sessionStorage.setItem(REF_KEY, fromUrl)
      return fromUrl as StoreRef
    }
    const saved = window.sessionStorage.getItem(REF_KEY)
    return saved && (STORE_REFS as readonly string[]).includes(saved) ? (saved as StoreRef) : null
  } catch {
    return null
  }
}

export function trackStore(
  type: StoreEventType,
  extra: { productId?: string | null; searchTerm?: string | null } = {},
): void {
  try {
    void fetch(`${API_BASE}/public/store/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // keepalive: el evento de «clic a WhatsApp» sale justo cuando la pestaña
      // se va; sin esto el navegador cancela la petición.
      keepalive: true,
      body: JSON.stringify({
        type,
        sessionId: getSessionId(),
        ref: captureRef(),
        productId: extra.productId ?? null,
        searchTerm: extra.searchTerm ?? null,
      }),
    }).catch(() => undefined)
  } catch {
    // medir es opcional
  }
}

const FROM_LIST_KEY = 'tdv-store-from-list'

/** El comprador viene de /store (y no de un link externo): el «volver» usa el historial. */
export function markFromList(): void {
  try {
    window.sessionStorage.setItem(FROM_LIST_KEY, '1')
  } catch {
    // sin sessionStorage el «volver» cae a /store, que es lo seguro
  }
}

export function consumeFromList(): boolean {
  try {
    const v = window.sessionStorage.getItem(FROM_LIST_KEY) === '1'
    window.sessionStorage.removeItem(FROM_LIST_KEY)
    return v
  } catch {
    return false
  }
}

export function peekFromList(): boolean {
  try {
    return window.sessionStorage.getItem(FROM_LIST_KEY) === '1'
  } catch {
    return false
  }
}
