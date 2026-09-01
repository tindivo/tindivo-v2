export type MapLayerMode = 'street' | 'satellite'

export interface TileLayerConfig {
  url: string
  attribution: string
  maxNativeZoom: number
  maxZoom: number
}

export const MAP_TILES: Record<MapLayerMode, TileLayerConfig> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxNativeZoom: 19,
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Imágenes &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',
    /**
     * Topado en z17 para San Jacinto: a partir de z18 el servicio devuelve placeholder.
     * Leaflet escala el z17 para zoom 18/19 de forma nítida.
     */
    maxNativeZoom: 17,
    maxZoom: 19,
  },
}

export const SATELLITE_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
