'use client'

import { create } from 'zustand'

export interface CartModifier {
  groupName: string
  optionName: string
  optionId: string
  price: number
}

export interface CartLine {
  /** Clave única por configuración (un ítem puede estar varias veces con distintos extras). */
  key: string
  itemId: string
  name: string
  /** Precio unitario YA con modificadores incluidos. */
  unitPrice: number
  quantity: number
  modifiers: CartModifier[]
  note: string | null
  hue: number
}

interface CartState {
  businessId: string | null
  businessName: string | null
  lines: CartLine[]
  /** Agrega una línea configurada; si es de otro negocio, reinicia el carrito. */
  addLine: (
    businessId: string,
    businessName: string,
    line: Omit<CartLine, 'key'> & { key?: string },
  ) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
  count: () => number
  subtotal: () => number
}

let seq = 0

export const useCart = create<CartState>((set, get) => ({
  businessId: null,
  businessName: null,
  lines: [],

  addLine: (businessId, businessName, line) =>
    set((state) => {
      const sameBusiness = state.businessId === businessId
      const lines = sameBusiness ? [...state.lines] : []
      seq += 1
      lines.push({ ...line, key: line.key ?? `${line.itemId}-${seq}` })
      return { businessId, businessName, lines }
    }),

  setQty: (key, qty) =>
    set((state) => {
      const lines = state.lines
        .map((l) => (l.key === key ? { ...l, quantity: Math.max(1, qty) } : l))
        .filter((l) => l.quantity > 0)
      return lines.length > 0 ? { lines } : { lines, businessId: null, businessName: null }
    }),

  remove: (key) =>
    set((state) => {
      const lines = state.lines.filter((l) => l.key !== key)
      return lines.length > 0 ? { lines } : { lines, businessId: null, businessName: null }
    }),

  clear: () => set({ businessId: null, businessName: null, lines: [] }),

  count: () => get().lines.reduce((n, l) => n + l.quantity, 0),
  subtotal: () =>
    Math.round(get().lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100,
}))
