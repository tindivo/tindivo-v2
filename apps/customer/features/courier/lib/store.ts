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
  /** A qué paso volver al terminar (o cancelar) el pin-drop. */
  returnStep: CourierFlowStep | null
  /** Qué fila de "Tu ruta" (`trip`) está activa/editable ahora mismo. */
  activeTripPoint: CourierEditingPoint

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
  /** Pedir-2 → Pedir-2b: guarda la coordenada, pasa a escribir la referencia. */
  confirmPinDrop: (coordinates: { lat: number; lng: number }, accuracyM: number | null) => void
  /** Pedir-2b → paso de origen: guarda el texto y vuelve. */
  confirmPinNote: (referenceText: string) => void
  /**
   * `trip` → "Listo" en la fila activa: si el punto activo ya tiene
   * coordenadas y texto, avanza. Si con esto quedan AMBOS puntos completos,
   * pasa a `trip-details`; si no, activa la fila que todavía falte (así
   * volver a fijar un punto ya hecho, desde `trip-details`, no reinicia el
   * otro punto que ya estaba listo).
   */
  advanceTripPoint: () => void
  /**
   * `trip` → tocar una fila ya completa (p.ej. volver a A después de haber
   * llegado a B): activa esa fila para ajustarla SIN limpiarla — a
   * diferencia de `beginChangePoint`, que es para cuando ya se confirmó el
   * popup de "¿Estás seguro?" en `trip-details` y sí hay que empezar de cero.
   */
  focusTripPoint: (which: CourierEditingPoint) => void
  /**
   * `trip-details` → "Cambiar" en Ubicación (tras confirmar el popup): limpia
   * coordenadas y referencia de `which` y vuelve a `trip` con esa fila activa.
   */
  beginChangePoint: (which: CourierEditingPoint) => void
}

function isPointComplete(point: CourierDraft['origin']): boolean {
  return point.coordinates != null && point.referenceText.trim().length > 0
}

export const useCourierStore = create<CourierState>((set, get) => ({
  open: false,
  step: 'trip',
  draft: emptyCourierDraft(),
  fromBusiness: false,
  tracking: null,
  trackingShortId: null,
  editingPoint: null,
  returnStep: null,
  activeTripPoint: 'origin',

  openSheet: (opts) =>
    set({
      open: true,
      step: opts?.step ?? 'trip',
      draft: emptyCourierDraft(),
      fromBusiness: false,
      editingPoint: null,
      returnStep: null,
      activeTripPoint: 'origin',
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
    set((s) => ({ step: s.returnStep ?? 'route', editingPoint: null, returnStep: null })),

  confirmPinDrop: (coordinates, accuracyM) =>
    set((s) => {
      if (!s.editingPoint) return {}
      const draft = {
        ...s.draft,
        [s.editingPoint]: { ...s.draft[s.editingPoint], coordinates, accuracyM },
      }
      // Desde `trip` la referencia se escribe inline en la fila del punto: no
      // hay paso `pin-note` aparte, se vuelve directo. El camino de negocio
      // oculto (`confirm` vía `PointField`) sigue pasando por `pin-note`.
      if (s.returnStep === 'trip') {
        return { draft, step: 'trip', editingPoint: null, returnStep: null }
      }
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

  advanceTripPoint: () =>
    set((s) => {
      const bothComplete = isPointComplete(s.draft.origin) && isPointComplete(s.draft.destination)
      if (bothComplete) return { step: 'trip-details' }
      return { activeTripPoint: isPointComplete(s.draft.origin) ? 'destination' : 'origin' }
    }),

  focusTripPoint: (which) => set({ activeTripPoint: which }),

  beginChangePoint: (which) =>
    set((s) => ({
      draft: {
        ...s.draft,
        [which]: { ...s.draft[which], coordinates: null, accuracyM: null, referenceText: '' },
      },
      step: 'trip',
      activeTripPoint: which,
    })),
}))
