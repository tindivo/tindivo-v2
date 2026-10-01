export interface TileSource {
  url: string
  attribution: string
  subdomains?: string
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

/**
 * El mapa de calles de todas las apps: CARTO Positron.
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
export function streetTiles(
  cartoKey: string | undefined = process.env.NEXT_PUBLIC_CARTO_API_KEY,
  production: boolean = process.env.NODE_ENV === 'production',
): TileSource {
  if (!cartoKey && !production) {
    return { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTRIBUTION }
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
