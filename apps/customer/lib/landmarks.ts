'use client'

import type { MapLandmarkCategory } from '@tindivo/contracts'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * LAS REFERENCIAS DEL PUEBLO, PARA QUIEN NO RECONOCE SU CALLE POR EL NOMBRE.
 *
 * El mapa de elegir ubicación era un lienzo de calles rotuladas, y en San
 * Jacinto eso no basta: la gente ubica su casa por la botica de la esquina o
 * por el colegio, no por "Calle Iquitos". Estos puntos los carga el admin a
 * mano (`/mapa-referencias`, tabla `map_landmarks`, migración 0208).
 *
 * SE LEE DIRECTO DESDE EL NAVEGADOR, sin pasar por la API, igual que
 * `coverage.ts`: es una tabla de solo lectura detrás de la policy
 * `ml_public_read` (que ya filtra por `active`), así que meterla en un
 * endpoint solo sumaría el medio segundo de piso que cuesta el salto a la API
 * sin ganar ni un control más.
 */
export interface Landmark {
  id: string
  name: string
  category: MapLandmarkCategory
  lat: number
  lng: number
}

/**
 * EL GLIFO DE CADA CATEGORÍA, EN SVG Y NO EN FUENTE DE ICONOS.
 *
 * El resto de la app usa Material Symbols (`DECISIONS.md §1`) y aquí también se
 * usaba, vía la ligadura de `--icon-glyph`. Se cambió por SVG en línea por tres
 * motivos, y ninguno es estético:
 *
 * 1. LA FUENTE LLEGA TARDE. Estos marcadores se pintan en cuanto responde
 *    `map_landmarks`, que es una consulta local y rápida; la hoja de Google
 *    Fonts es una petición a otro dominio. Mientras no llega, la ligadura no
 *    resuelve y el disco de color sale VACÍO. En San Jacinto, con la cobertura
 *    que hay, ese hueco no dura un parpadeo.
 * 2. A 10 px UNA FUENTE NO SE GOBIERNA. El glifo se centra según métricas
 *    tipográficas (ascendente, `line-height`), no según su tinta, así que
 *    queda descentrado dentro del círculo por una cantidad distinta en cada
 *    icono. En SVG el glifo se escala y se centra contra el propio círculo.
 * 3. SON DIBUJOS, NO TEXTO. Un glifo de fuente dentro de un `divIcon` es
 *    contenido generado por CSS que un lector de pantalla puede intentar leer;
 *    estas referencias ya van con `interactive: false` y `aria-hidden`.
 *
 * Los dibujos están authored en una rejilla de 24×24 y el renderer los escala
 * y los centra (ver `iconoDe` en `map-picker-inner.tsx`), así que aquí solo
 * importa que ocupen la rejilla entera y que se lean de un vistazo: el color
 * NO desambigua nada por sí solo —hay que leer el nombre para saber qué es, y
 * entonces el color sobra— pero una cruz es una botica en cualquier mapa del
 * mundo, incluso antes de acercarse lo bastante para que aparezcan los nombres.
 *
 * El blanco lo pone el renderer en el `<g>` contenedor, y con él el color de
 * la categoría como `currentColor`: un dibujo que necesite las dos tintas —el
 * balón— las tiene sin recibir el color por parámetro.
 *
 * Los rótulos del panel ("Salud (botica, posta)") NO se reutilizan acá: allá
 * nombran una opción de un desplegable, y aquí el nombre propio del sitio ya
 * está escrito al lado del icono.
 */
export const LANDMARK_STYLE: Record<MapLandmarkCategory, { color: string; glyph: string }> = {
  // Cruz médica: el palo corto arriba y abajo la separa de la latina.
  salud: {
    color: '#e11d48',
    glyph: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  },
  // Toldo + local con su puerta.
  mercado: {
    color: '#d97706',
    glyph: '<path d="M3 4.5h18v3.6H3z"/><path d="M4.8 9.6h14.4V20h-4.6v-5.6H9.4V20H4.8z"/>',
  },
  // Birrete.
  educacion: {
    color: '#2563eb',
    glyph:
      '<path d="M12 3 1.2 8.4 12 13.8l10.8-5.4z"/>' +
      '<path d="M5.9 11.9v3.7c0 1.5 2.7 2.7 6.1 2.7s6.1-1.2 6.1-2.7v-3.7L12 15z"/>',
  },
  /*
   * Cruz latina, y el reparto de sus proporciones NO es gusto: es lo único que
   * la separa de la de `salud`. Con los brazos a media altura y el trazo grueso
   * —que es como se dibujó primero— las dos salían siendo el mismo signo `+` en
   * dos colores, y a 10 px el color no desambigua: hay que leer el nombre, y si
   * hay que leer el nombre el icono no sirvió de nada.
   *
   * Así que la médica es ANCHA Y CENTRADA (brazos de 4 de grueso, cruzando en
   * el medio) y esta es ALTA Y FINA (brazos de 2.8, cruzando al 27% de la
   * altura, con el palo bajando hasta abajo del todo). Lo que se distingue de
   * un vistazo es la silueta, no el detalle.
   */
  religioso: {
    color: '#7c3aed',
    glyph: '<path d="M10.6 1.6h2.8v5.6h4.6V10h-4.6v12.4h-2.8V10H6V7.2h4.6z"/>',
  },
  /*
   * Balón, y va EN NEGATIVO: disco blanco con los parches del color de la
   * categoría, no un aro blanco con un pentágono dentro. Dibujado en positivo
   * —que fue el primer intento— el aro fino y el pentágono diminuto se
   * fusionaban a 10 px en un anillo con un punto en medio, o sea una diana,
   * indistinguible del punto genérico de `otro`. En negativo el ojo ve primero
   * un disco claro con manchas, que es exactamente lo que es un balón.
   *
   * Las costuras llegan al canto y son FINAS, y ese par de decisiones costó
   * dos intentos fallidos: gruesas y hasta el borde el dibujo era una rueda
   * de timón; finas pero cortas, una estrella de cinco puntas. Un balón se
   * reconoce porque el parche central está CERRADO por costuras que llegan
   * al borde — si mueren antes, lo que se ve es la estrella que forman.
   *
   * Los parches usan `currentColor` y no el color escrito a mano: el renderer
   * lo pone en el `<g>` contenedor, así que este dibujo hereda el color de su
   * categoría igual que el resto sin tener que interpolarlo aquí.
   */
  deporte: {
    color: '#0891b2',
    glyph:
      '<circle cx="12" cy="12" r="11" fill="#fff"/>' +
      '<path d="M12 7.6V1.6M16.18 10.64 22.46 8.6M14.59 15.56 18.47 20.9' +
      'M9.41 15.56 5.53 20.9M7.82 10.64 1.54 8.6" ' +
      'stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M12 7.6 16.18 10.64 14.59 15.56H9.41L7.82 10.64z" fill="currentColor"/>',
  },
  // Árbol: dos copas y tronco.
  recreacion: {
    color: '#16a34a',
    glyph: '<path d="M12 2.6 6.4 10.6h11.2zM12 7.2 4 18h16zM10.7 17h2.6V21h-2.6z"/>',
  },
  // Frontón, columnas y basamento.
  gobierno: {
    color: '#475569',
    glyph:
      '<path d="M12 2.6 2.4 8v2.2h19.2V8zM5 11.8h2.6v6.2H5zM10.7 11.8h2.6v6.2h-2.6z' +
      'M16.4 11.8H19v6.2h-2.6zM2.8 19.2h18.4v2.2H2.8z"/>',
  },
  /*
   * Tenedor y cuchara (0214). Los dos juntos y no uno solo: un tenedor a 10 px
   * es un peine, y un cubierto suelto no dice «comida». El par sí, y es el mismo
   * signo que usa cualquier mapa del mundo.
   *
   * CUCHARA Y NO CUCHILLO, aunque el par clásico sea el otro: se dibujaron los
   * dos y a tamaño de chapa el cuchillo pierde. Su hoja es una cuña estrecha que
   * a 10 px queda casi tan recta como el mango del tenedor, y entonces las dos
   * mitades se leen como dos barras — un icono de pausa. El cuenco de la cuchara
   * es una mancha redonda contra el peine de las púas, y ese contraste es lo que
   * sobrevive al tamaño. Es la misma lección que el balón de `deporte`: manda la
   * silueta, no el detalle.
   *
   * Las púas llegan al borde de arriba y los mangos al de abajo: ocupar la
   * rejilla entera es lo que evita que el renderer lo encoja a un manchón
   * centrado.
   *
   * El naranja queda cerca del ámbar de `mercado`, y se deja: son las dos
   * categorías de «sitio donde se compra algo», el color no desambigua nada por
   * sí solo (ver la cabecera) y las siluetas —cubiertos contra toldo y local— no
   * se parecen en nada.
   */
  restaurante: {
    color: '#ea580c',
    glyph:
      '<path d="M4.4 2h1.5v6.4H4.4zM7.3 2h1.5v6.4H7.3zM10.2 2h1.5v6.4h-1.5z"/>' +
      '<path d="M3.8 9.2h8.3v1c0 1.5-1 2.8-2.4 3.2V22H7.4v-8.6C6 13 5 11.7 5 10.2z"/>' +
      '<path d="M15.1 2h1.2c2 1.9 3.1 4.6 3.1 7.4 0 2.1-1 3.6-2.5 4.1V22h-1.8z"/>',
  },
  /*
   * Cama (0214). La silueta es lo contrario que todo lo demás de esta lista:
   * ancha y baja, con un poste alto a la izquierda. No se parece a la caja del
   * mercado —que es alta y con toldo— ni al frontón de gobierno, que es
   * simétrico; y a 10 px «bulto tumbado con cabecero» se lee antes que
   * cualquier letra H, que además chocaría con el nombre escrito al lado.
   *
   * La almohada es un bloque aparte y no un redondeo del colchón: es el único
   * detalle que impide que esto se lea como un banco o un escalón.
   */
  hotel: {
    color: '#4f46e5',
    glyph:
      '<path d="M2.2 5.2h2.3V21H2.2z"/>' +
      '<path d="M5.9 9.6h4.8v3.4H5.9z"/>' +
      '<path d="M4.5 13.8h17.3v4.4H4.5z"/>' +
      '<path d="M19.5 18.9h2.3V21h-2.3z"/>',
  },
  // Sin categoría: el punto genérico, igual que el POI sin icono de Google.
  otro: {
    color: '#64748b',
    glyph: '<circle cx="12" cy="12" r="5.4"/>',
  },
}

let cached: Promise<Landmark[]> | null = null

async function fetchLandmarks(): Promise<Landmark[]> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('map_landmarks')
      .select('id,name,category,lat,lng')
      // Redundante con la policy, y aun así explícito: si algún día la RLS se
      // abre, esta pantalla no empieza a pintar sola los puntos apagados.
      .eq('active', true)
    if (!data) return []
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
    }))
  } catch {
    // Un fallo acá no puede impedir elegir la ubicación: son una ayuda, no un
    // requisito. Sin referencias, el mapa es exactamente el de antes.
    return []
  }
}

/** Referencias activas, memoizadas por sesión de página (como `getCoverage`). */
export function getLandmarks(): Promise<Landmark[]> {
  if (!cached) cached = fetchLandmarks()
  return cached
}
