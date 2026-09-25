import { stripPeCountryCode } from './phone'

export interface CourierContact {
  name: string
  /** Solo los 9 dígitos locales. */
  phone: string
}

interface ContactRow {
  origin_name: string | null
  origin_phone: string | null
  destination_name: string | null
  destination_phone: string | null
}

const MAX_SUGGESTIONS = 5

/**
 * Los contactos que esta persona ya usó en entregas anteriores, del más
 * reciente al más antiguo y sin repetir (por celular; sin celular, por nombre).
 * Quien entrega y quien recibe se mezclan a propósito: la misma persona
 * (una vecina, un familiar) es el recojo un día y la entrega otro.
 *
 * `me` se excluye: ya tiene su propio atajo, «Soy yo».
 */
export function recentContacts(rows: readonly ContactRow[], me: string | null): CourierContact[] {
  const mine = me ? stripPeCountryCode(me) : ''
  const seen = new Set<string>()
  const out: CourierContact[] = []

  const push = (name: string | null, phone: string | null) => {
    const n = (name ?? '').trim()
    if (!n) return
    const p = stripPeCountryCode(phone ?? '')
    if (mine && p === mine) return
    const key = p || n.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name: n, phone: p })
  }

  for (const r of rows) {
    push(r.destination_name, r.destination_phone)
    push(r.origin_name, r.origin_phone)
    if (out.length >= MAX_SUGGESTIONS * 3) break
  }
  return out
}

/**
 * Lo que se le ofrece a quien escribe un nombre: los contactos que lo contienen
 * (sin distinguir mayúsculas ni tildes). Con el campo vacío, todos.
 */
export function suggestContacts(
  all: readonly CourierContact[],
  typed: string,
  limit = MAX_SUGGESTIONS,
): CourierContact[] {
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const q = fold(typed)
  const list = q ? all.filter((c) => fold(c.name).includes(q) && fold(c.name) !== q) : all
  return list.slice(0, limit)
}
