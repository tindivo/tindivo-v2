export interface TileSource {
  url: string
  attribution: string
  subdomains?: string
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

/**
 * El mapa de calles del cliente y el admin: CARTO Positron. (El motorizado
 * usa `OSM_TILES`.)
 *
 * EN PRODUCCIÓN, SIEMPRE CARTO. La key (`NEXT_PUBLIC_CARTO_API_KEY`) está
 * configurada en el despliegue, y Positron es el estilo elegido a propósito
 * (calles legibles al acercar, sin POIs que compitan con los nuestros; el
 * razonamiento está en `apps/customer/components/map-picker-inner.tsx`).
 *
 * EN DESARROLLO SIN KEY, OPENSTREETMAP. CARTO dejó de servir sin credencial:
 * responde a todo un PNG de 2 KB que dice «API KEY REQUIRED» con HTTP 200, y
 * Leaflet lo pinta. Para que el mapa local se pueda usar sin pedir la key a
 * nadie, se cae a OSM — solo fuera de producción, para que un despliegue sin
 * la variable se note (letrero) en vez de cambiar de estilo en silencio.
 *
 * Las dos variables se leen como `process.env.X` literal para que Next las
 * incruste en el bundle del navegador.
 */
/**
 * El mapa ESTÁNDAR de OpenStreetMap (el de Leaflet de siempre), en cualquier
 * entorno. Es el del motorizado: a diferencia de Positron, rotula comercios,
 * grifos, colegios y nombres de calle con más detalle, y el motorizado se
 * orienta por eso, no por el pin solo (decisión de Jesús, 7-oct). El cliente
 * sigue en `STREET_TILES` (CARTO).
 *
 * Política de uso de `tile.openstreetmap.org`: sin uso masivo y con atribución.
 * Con uno o dos motorizados a la vez está muy por debajo de cualquier límite;
 * si eso cambiara, pasar a un proveedor propio.
 */
export const OSM_TILES: TileSource = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: OSM_ATTRIBUTION,
}

export function streetTiles(
  cartoKey: string | undefined = process.env.NEXT_PUBLIC_CARTO_API_KEY,
  production: boolean = process.env.NODE_ENV === 'production',
): TileSource {
  if (!cartoKey && !production) {
    return OSM_TILES
  }
  return {
    url:
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' +
      (cartoKey ? `?key=${cartoKey}` : ''),
    attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`,
    subdomains: 'abcd',
  }
}

export const STREET_TILES: TileSource = streetTiles()
