'use client'

import { DELIVERY_METHODS, type DeliveryMethod } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BusinessDetail } from '@/features/catalog/types'
import type { CartValidationResult } from '@/lib/cart-validation'
import { validateCartAgainstCatalog } from '@/lib/cart-validation'

/**
 * Cómo se recibe un pedido nuevo mientras nadie diga lo contrario.
 *
 * `delivery` es el lado conservador y no el más común: es el que PIDE MÁS
 * —domicilio, referencia, pin en zona— así que equivocarse hacia aquí le cuesta
 * al cliente un formulario de más, mientras que equivocarse hacia `pickup` le
 * cuesta un 409 en el último toque contra un negocio que no acepta recojo.
 */
const DEFAULT_DELIVERY_METHOD: DeliveryMethod = 'delivery'

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
  /** Foto del plato (si el negocio subió una); si no, se usa el placeholder de `hue`. */
  imageUrl: string | null
}

export interface CartState {
  businessId: string | null
  businessName: string | null
  lines: CartLine[]
  /** Resultado de la última validación contra el catálogo del backend. */
  validation: CartValidationResult | null
  /**
   * Cómo quiere recibir ESTE pedido: a domicilio o recogiéndolo en el local.
   *
   * VIVE EN LA BOLSA Y NO EN EL PERFIL porque no es una preferencia de la
   * persona sino una decisión de este pedido concreto: el mismo vecino pide a
   * casa el martes y pasa por el local el viernes camino del trabajo.
   *
   * Y VIVE AQUÍ Y NO EN EL CHECKOUT —que es donde estaba— porque la decisión
   * gobierna cosas que ocurren mucho antes de esa pantalla: si el gate del
   * carrito exige domicilio (`lib/order-gates.ts`), qué dice la cabecera del
   * negocio y si el envío suma al total. Un estado que nace en el último paso
   * no puede gobernar los primeros.
   *
   * Se persiste con el resto de la bolsa: quien elige recojo, cierra la app y
   * vuelve, no tiene por qué volver a decirlo.
   */
  deliveryMethod: DeliveryMethod
  setDeliveryMethod: (method: DeliveryMethod) => void
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
  /** Valida las líneas contra el catálogo actual del backend. */
  validateAgainst: (catalog: BusinessDetail) => void
  /** Borra el resultado de validación (útil al cerrar advertencias). */
  setValidation: (validation: CartValidationResult | null) => void
  /** Elimina las líneas marcadas como inválidas por la última validación. */
  removeInvalidLines: () => void
  /** true si hay líneas inválidas en la última validación. */
  hasInvalidLines: () => boolean
}

let seq = 0
const nextKey = (itemId: string) => {
  seq += 1
  // Sufijo aleatorio: el contador `seq` se reinicia en cada carga de página, pero las
  // líneas persistidas conservan su clave; sin esto, una línea nueva podría regenerar
  // una clave ya existente (`itemId-1`) y colisionar → warning de React "same key".
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${itemId}-${seq}-${rand}`
}

/**
 * Firma de configuración de una línea: dos líneas son "la misma" (y por tanto se
 * fusionan sumando cantidad) si coinciden el ítem, el conjunto de opciones de
 * modificadores y la nota. Una sola opción distinta ⇒ firma distinta ⇒ línea aparte.
 */
const lineSignature = (l: {
  itemId: string
  modifiers: CartModifier[]
  note: string | null
}): string =>
  `${l.itemId}|${l.modifiers
    .map((m) => m.optionId)
    .sort()
    .join(',')}|${(l.note ?? '').trim()}`

// localStorage no existe en el server (Next SSR): storage no-op como fallback.
const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

/**
 * Todo lo que deja de ser verdad cuando la bolsa se queda sin negocio.
 *
 * ESTABA ESCRITO CINCO VECES —vaciar por cantidad, vaciar por quitar, `clear`,
 * limpiar líneas inválidas y el cambio de negocio de `addLine`— y las cinco
 * repetían el mismo literal. Añadir `deliveryMethod` a mano en cada una era
 * pedir que se olvidara justo en la quinta, y la que se olvide deja una bolsa
 * de un negocio nuevo con el «recojo» del anterior puesto.
 *
 * El método vuelve al valor por defecto y NO se conserva a propósito: aceptar
 * recojo es de cada negocio (`accepts_web_pickup`), así que arrastrarlo al
 * siguiente es exactamente cómo se llega al 409 que este trabajo viene a cerrar.
 */
const EMPTY_CART: Pick<CartState, 'businessId' | 'businessName' | 'validation' | 'deliveryMethod'> =
  {
    businessId: null,
    businessName: null,
    validation: null,
    deliveryMethod: DEFAULT_DELIVERY_METHOD,
  }

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      ...EMPTY_CART,
      lines: [],

      setDeliveryMethod: (method) => set({ deliveryMethod: method }),

      addLine: (businessId, businessName, line) =>
        set((state) => {
          const sameBusiness = state.businessId === businessId
          const lines = sameBusiness ? [...state.lines] : []
          // Al cambiar de negocio se descarta la validación anterior.
          const validation = sameBusiness ? state.validation : null
          // …y también el método: el negocio nuevo puede no aceptar recojo.
          const deliveryMethod = sameBusiness ? state.deliveryMethod : DEFAULT_DELIVERY_METHOD
          // Fusiona con una línea idéntica (mismo ítem + opciones + nota): suma cantidad.
          const sig = lineSignature(line)
          const idx = lines.findIndex((l) => lineSignature(l) === sig)
          if (idx >= 0) {
            const existing = lines[idx]
            if (existing) {
              lines[idx] = { ...existing, quantity: existing.quantity + line.quantity }
              return { businessId, businessName, lines, validation, deliveryMethod }
            }
          }
          lines.push({ ...line, key: line.key ?? nextKey(line.itemId) })
          return { businessId, businessName, lines, validation, deliveryMethod }
        }),

      replace: (businessId, businessName, lines) =>
        set(() => ({
          businessId,
          businessName,
          lines: lines.map((l) => ({ ...l, key: nextKey(l.itemId) })),
          validation: null,
          // Puede venir de otro negocio, y el pedido repetido no arrastra el
          // metodo del anterior: se vuelve a elegir.
          deliveryMethod: DEFAULT_DELIVERY_METHOD,
        })),

      setQty: (key, qty) =>
        set((state) => {
          const lines = state.lines
            .map((l) => (l.key === key ? { ...l, quantity: Math.max(1, qty) } : l))
            .filter((l) => l.quantity > 0)
          return lines.length > 0 ? { lines } : { lines, ...EMPTY_CART }
        }),

      remove: (key) =>
        set((state) => {
          const lines = state.lines.filter((l) => l.key !== key)
          return lines.length > 0 ? { lines } : { lines, ...EMPTY_CART }
        }),

      clear: () => set({ ...EMPTY_CART, lines: [] }),

      count: () => get().lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: () =>
        Math.round(get().lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100,

      validateAgainst: (catalog) =>
        set((state) => {
          if (state.businessId !== catalog.business.id) return state
          return { validation: validateCartAgainstCatalog(state.lines, catalog) }
        }),

      setValidation: (validation) => set({ validation }),

      removeInvalidLines: () =>
        set((state) => {
          if (!state.validation) return state
          const invalidKeys = new Set(state.validation.invalidLines.map((l) => l.key))
          const lines = state.lines.filter((l) => !invalidKeys.has(l.key))
          return lines.length > 0
            ? { lines, validation: { ...state.validation, invalidLines: [] } }
            : { lines, ...EMPTY_CART }
        }),

      hasInvalidLines: () => {
        const v = get().validation
        return v != null && v.invalidLines.length > 0
      },
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
        deliveryMethod: s.deliveryMethod,
      }),
      // Al rehidratar, re-asigna claves únicas: sana carritos previos que pudieran tener
      // claves duplicadas y garantiza unicidad para React (keys estables por sesión).
      // La validación nunca se persiste: se recalcula al cargar el catálogo.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<
          Pick<CartState, 'businessId' | 'businessName' | 'lines' | 'deliveryMethod'>
        >
        return {
          ...(current as CartState),
          businessId: p.businessId ?? null,
          businessName: p.businessName ?? null,
          lines: (p.lines ?? []).map((l) => ({ ...l, key: nextKey(l.itemId) })),
          validation: null,
          // SE COMPRUEBA CONTRA EL ENUM, no se acepta lo que venga. Esto sale de
          // `localStorage`, que sobrevive a los despliegues: una bolsa guardada
          // por una versión anterior no trae la clave (y `undefined` colaría como
          // método), y nada impide que alguien la edite a mano. Un valor que no
          // existe se propagaría hasta el 422 del contrato al confirmar.
          deliveryMethod: DELIVERY_METHODS.includes(p.deliveryMethod as DeliveryMethod)
            ? (p.deliveryMethod as DeliveryMethod)
            : DEFAULT_DELIVERY_METHOD,
        }
      },
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
