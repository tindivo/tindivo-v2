import { MAP_LANDMARK_CATEGORIES, type MapLandmarkCategory } from '@tindivo/contracts'

export type { MapLandmarkCategory }
export { MAP_LANDMARK_CATEGORIES }

/** Rótulo y color por categoría. El color es lo que distingue los puntos en el mapa. */
export const LANDMARK_CATEGORY_META: Record<MapLandmarkCategory, { label: string; color: string }> =
  {
    salud: { label: 'Salud (botica, posta)', color: '#ef4444' },
    mercado: { label: 'Mercado / tienda', color: '#f59e0b' },
    educacion: { label: 'Educación (colegio)', color: '#3b82f6' },
    religioso: { label: 'Religioso (iglesia)', color: '#8b5cf6' },
    deporte: { label: 'Deporte (coliseo, losa)', color: '#06b6d4' },
    recreacion: { label: 'Recreación (parque, plaza)', color: '#22c55e' },
    gobierno: { label: 'Gobierno', color: '#64748b' },
    otro: { label: 'Otro', color: '#94a3b8' },
  }
