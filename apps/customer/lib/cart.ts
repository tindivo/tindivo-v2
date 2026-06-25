'use client'

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

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
  /** Reemplaza toda la bolsa (usado por "Volver a pedir"). */
  replace: (businessId: string, businessName: string, lines: Omit<CartLine, 'key'>[]) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
  count: () => number
  subtotal: () => number
}

let seq = 0
const nextKey = (itemId: string) => {
  seq += 1
  return `${itemId}-${seq}`
}

// localStorage no existe en el server (Next SSR): storage no-op como fallback.
const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      businessId: null,
      businessName: null,
      lines: [],

      addLine: (businessId, businessName, line) =>
        set((state) => {
          const sameBusiness = state.businessId === businessId
          const lines = sameBusiness ? [...state.lines] : []
          lines.push({ ...line, key: line.key ?? nextKey(line.itemId) })
          return { businessId, businessName, lines }
        }),

      replace: (businessId, businessName, lines) =>
        set(() => ({
          businessId,
          businessName,
          lines: lines.map((l) => ({ ...l, key: nextKey(l.itemId) })),
        })),

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
    }),
    {
      name: 'tindivo-cart-v1',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : memoryStorage,
      ),
      // Solo el estado, no las acciones.
      partialize: (s) => ({
        businessId: s.businessId,
        businessName: s.businessName,
        lines: s.lines,
      }),
      // Hidratamos manualmente tras montar (CartHydrator) para evitar mismatch SSR.
      skipHydration: true,
    },
  ),
)

/** Monta una vez en el layout: rehidrata la bolsa desde localStorage tras el primer render. */
export function CartHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate()
  }, [])
  return null
}

/**
 * `true` cuando la bolsa ya se rehidrató desde localStorage. Úsalo para no mostrar el
 * contador en SSR/primer render (evita hydration mismatch: server siempre ve 0).
 */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (useCart.persist.hasHydrated()) setHydrated(true)
    return useCart.persist.onFinishHydration(() => setHydrated(true))
  }, [])
  return hydrated
}
