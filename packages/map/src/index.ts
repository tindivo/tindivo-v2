// Entrada PURA: sin Leaflet. Se puede importar desde cualquier módulo, también
// los que se renderizan en el servidor. Los componentes de mapa van en
// `@tindivo/map/leaflet`, que toca `window` al cargarse.
export { escaparHtml } from './html'
export { LANDMARK_CATEGORY_LABEL, LANDMARK_STYLE, type Landmark } from './landmarks'
export type { RoutePin, RoutePinVariant } from './route-types'
export { STREET_TILES, streetTiles, type TileSource } from './tiles'
export type { LatLng } from './types'
