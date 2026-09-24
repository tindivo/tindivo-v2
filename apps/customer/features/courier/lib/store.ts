'use client'

import { create } from 'zustand'
import {
  type CourierDraft,
  type CourierEditingPoint,
  type CourierFlowStep,
  type CourierOrderResult,
  emptyCourierDraft,
} from '../types'

interface CourierState {
  open: boolean
  step: CourierFlowStep
  draft: CourierDraft
  /** true si el flujo entró "desde un negocio" (Main.dc.html) — bloquea `route`. */
  fromBusiness: boolean
  /** La entrega recién creada o la que se está siguiendo. */
  tracking: CourierOrderResult | null
  trackingShortId: string | null
  /** Qué punto se está fijando en `pin-drop`/`pin-note`. `null` fuera de ese subflujo. */
  editingPoint: CourierEditingPoint | null
  /**
   * A qué paso volver al terminar (o cancelar) el pin-drop. `'trip-details'`
   * marca el camino por defecto: A → B → `trip-details`, y también la
   * corrección de un punto desde `trip-details`.
   */
  returnStep: CourierFlowStep | null

  openSheet: (opts?: { step?: CourierFlowStep }) => void
  openForBusiness: (business: {
    id: string
    name: string
    lat: number
    lng: number
    referenceText: string
    phone: string | null
  }) => void
  closeSheet: () => void
  goTo: (step: CourierFlowStep) => void
  updateDraft: (patch: Partial<CourierDraft>) => void
  updatePoint: (which: CourierEditingPoint, patch: Partial<CourierDraft['origin']>) => void
  openTracking: (shortId: string, result?: CourierOrderResult | null) => void
  submitted: (result: CourierOrderResult) => void
  /** Pedir-1/3b/4a → Pedir-2: abre el mapa a pantalla completa para `which`. */
  beginEditPoint: (which: CourierEditingPoint) => void
  /** Vuelve al paso anterior sin guardar nada del punto que se estaba fijando. */
  cancelEditPoint: () => void
  /**
   * Confirma el pin. Con `referenceText` (camino por defecto, la referencia se
   * escribe en la misma pantalla del mapa) guarda coordenada y texto juntos y
   * avanza: A → B → `trip-details`, o de vuelta a `trip-details` si se estaba
   * corrigiendo un punto. Sin él (camino de negocio) pasa a `pin-note`.
   */
  confirmPinDrop: (
    coordinates: { lat: number; lng: number },
    accuracyM: number | null,
    referenceText?: string,
  ) => void
  /** Pedir-2b → paso de origen: guarda el texto y vuelve. */
  confirmPinNote: (referenceText: string) => void
}

function isPointComplete(point: CourierDraft['origin']): boolean {
  return point.coordinates != null && point.referenceText.trim().length > 0
}

export const useCourierStore = create<CourierState>((set, get) => ({
  open: false,
  step: 'pin-drop',
  draft: emptyCourierDraft(),
  fromBusiness: false,
  tracking: null,
  trackingShortId: null,
  editingPoint: null,
  returnStep: null,

  // Sin `step` es el camino por defecto, mapa primero: se abre directo el
  // pin del punto A y, al confirmarlo, el del B (ver `confirmPinDrop`).
  openSheet: (opts) =>
    set({
      open: true,
      draft: emptyCourierDraft(),
      fromBusiness: false,
      ...(opts?.step
        ? { step: opts.step, editingPoint: null, returnStep: null }
        : { step: 'pin-drop', editingPoint: 'origin', returnStep: 'trip-details' }),
    }),

  openForBusiness: (business) =>
    set({
      open: true,
      step: 'confirm',
      fromBusiness: true,
      draft: {
        ...emptyCourierDraft(),
        origin: {
          contactName: business.name,
          contactPhone: business.phone ?? '',
          coordinates: { lat: business.lat, lng: business.lng },
          accuracyM: null,
          referenceText: business.referenceText,
          directoryBusinessId: business.id,
          label: business.name,
        },
        itemDescription: `Pedido de ${business.name}`,
      },
    }),

  closeSheet: () => set({ open: false }),

  goTo: (step) => set({ step }),

  updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),

  updatePoint: (which, patch) =>
    set((s) => ({
      draft: { ...s.draft, [which]: { ...s.draft[which], ...patch } },
    })),

  openTracking: (shortId, result) =>
    set({
      open: true,
      step: 'tracking',
      trackingShortId: shortId,
      tracking: result ?? get().tracking,
    }),

  submitted: (result) =>
    set({ step: 'tracking', tracking: result, trackingShortId: result.shortId }),

  beginEditPoint: (which) =>
    set((s) => ({ editingPoint: which, returnStep: s.step, step: 'pin-drop' })),

  cancelEditPoint: () =>
    set((s) => {
      if (s.returnStep === 'trip-details') {
        // Corrigiendo un punto desde `trip-details`: se vuelve ahí sin tocar nada.
        if (isPointComplete(s.draft.origin) && isPointComplete(s.draft.destination)) {
          return { step: 'trip-details', editingPoint: null, returnStep: null }
        }
        // Armando la ruta por primera vez: atrás desde B es volver a A, y atrás
        // desde A es salir del flujo (todavía no hay nada que perder).
        if (s.editingPoint === 'destination') return { editingPoint: 'origin' }
        return { open: false, editingPoint: null, returnStep: null }
      }
      return { step: s.returnStep ?? 'route', editingPoint: null, returnStep: null }
    }),

  confirmPinDrop: (coordinates, accuracyM, referenceText) =>
    set((s) => {
      if (!s.editingPoint) return {}
      const draft = {
        ...s.draft,
        [s.editingPoint]: {
          ...s.draft[s.editingPoint],
          coordinates,
          accuracyM,
          ...(referenceText === undefined ? {} : { referenceText }),
        },
      }
      if (s.returnStep === 'trip-details' && referenceText !== undefined) {
        const other: CourierEditingPoint = s.editingPoint === 'origin' ? 'destination' : 'origin'
        if (isPointComplete(draft[other])) {
          return { draft, step: 'trip-details', editingPoint: null, returnStep: null }
        }
        return { draft, editingPoint: other }
      }
      // Camino de negocio (`confirm` vía `PointField`): la referencia se
      // escribe en un paso aparte.
      return { draft, step: 'pin-note' }
    }),

  confirmPinNote: (referenceText) =>
    set((s) => {
      if (!s.editingPoint) return {}
      return {
        draft: {
          ...s.draft,
          [s.editingPoint]: { ...s.draft[s.editingPoint], referenceText },
        },
        step: s.returnStep ?? 'route',
        editingPoint: null,
        returnStep: null,
      }
    }),
}))
