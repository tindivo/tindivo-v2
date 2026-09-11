'use client'

import L, { type LatLngBoundsExpression } from 'leaflet'
import { memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { LANDMARK_STYLE, type Landmark } from '@/lib/landmarks'

export interface LatLng {
  lat: number
  lng: number
}

export type MapMode = 'street' | 'satellite'

export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

/**
 * SUTIL A PROPÓSITO. El pin y el botón "Sí, aquí es mi puerta" son lo que
 * manda en esta pantalla; el polígono solo informa de fondo, en tercer nivel.
 * Antes llevaba el trazo a opacidad plena (1.0) y un relleno al 10% — se leía
 * como el elemento principal del mapa, compitiendo con el pin por la mirada.
 * El 0.55 de trazo es la sensibilidad medida en la reseña que motivó aquel
 * cambio, no una intuición nueva, y por eso no se redondea por gusto.
 *
 * SIN RELLENO (`fill: false`), y eso es posterior. El relleno tenue que quedó
 * de aquella reseña seguía tiñendo el pueblo entero de naranja pálido, y sobre
 * el satélite —donde el trabajo es reconocer un techo— tapaba justo la señal
 * que se está buscando. El contorno solo dice lo mismo: dentro sí, fuera no.
 */
const ZONE_STYLE = {
  color: 'var(--color-brand)',
  weight: 2,
  opacity: 0.55,
  fill: false,
} as const

/**
 * Dos fondos para el mismo mapa, y los dos sirven para algo distinto.
 *
 * OSM tiene San Jacinto mejor mapeado de lo que uno esperaría —calles con
 * nombre, la Posta Médica—, así que la vista de calles orienta bien y es la que
 * abre por defecto. Lo que no hace es decirte CUÁL es tu casa: eso solo lo
 * resuelve la foto, donde la gente reconoce su propio techo.
 */
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY

const TILES: Record<
  MapMode,
  { url: string; attribution: string; maxNativeZoom: number; subdomains?: string }
> = {
  street: {
    /*
     * CARTO POSITRON, NI EL OSM CRUDO NI VOYAGER. Los tres son el mismo OSM
     * —la misma geometría, las mismas calles— y lo que cambia es el estilo.
     *
     * El OSM estándar pinta cada categoría de calle de un color distinto
     * (amarillo, naranja, blanco) con trazos gruesos y rótulos grandes: es un
     * mapa hecho para leerse SOLO. Aquí el mapa es el FONDO de una tarea
     * —colocar un pin en tu puerta— y compite con ella.
     *
     * Voyager fue el primer reemplazo y el problema fue otro: tira a beige, y
     * a zoom cerrado dibuja las calles en blanco roto sobre suelo blanco roto,
     * así que al ACERCARSE —justo cuando hay que afinar la puerta— la trama de
     * calles se desvanece. Se intentó arreglar con un filtro CSS y ahí está la
     * trampa que costó el rodeo: `hue-rotate`, que es lo único que enfría de
     * verdad un beige, gira la rueda ENTERA. El mismo giro que enfría las
     * manzanas manda el verde de los parques a lila y el azul del río a
     * naranja — medido en San Jacinto, el parque del noreste salía morado.
     *
     * Positron ya es lo que se estaba persiguiendo con el filtro: suelo gris
     * frío, calles blancas con contorno gris que SÍ se leen al acercar,
     * huellas de edificio visibles, y el agua y los parques en su color. Sin
     * filtro encima: nada que corregir, nada que mentir. Y como apenas dibuja
     * POIs propios, los únicos puntos de color del lienzo pasan a ser los
     * nuestros — que es de lo que va esta pantalla.
     *
     * El `?key=` es opcional: los basemaps de CARTO se sirven sin credencial y
     * la key solo sube el cupo. Por eso se omite el parámetro entero si la
     * variable no está, en vez de mandar `?key=` vacío.
     *
     * `{r}` es el sufijo de retina de Leaflet, y sin `detectRetina` resuelve a
     * cadena vacía. Se deja escrito a propósito: activar retina aquí es un
     * cambio de una línea, pero DUPLICA los bytes de cada tile y esta pantalla
     * se abre sobre la cobertura móvil de un pueblo. Decisión de datos, no de
     * nitidez.
     */
    url:
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' +
      (CARTO_KEY ? `?key=${CARTO_KEY}` : ''),
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    maxNativeZoom: 19,
    subdomains: 'abcd',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imágenes &copy; Esri',
    /**
     * 17 Y NO MÁS. Medido contra el servicio, no supuesto: sobre San Jacinto,
     * World_Imagery devuelve foto de verdad hasta z17 (~21 KB por tile) y a
     * partir de z18 el MISMO placeholder de 2521 bytes que dice «Map data not
     * yet available». Lo sirve con HTTP 200, así que Leaflet lo da por bueno y
     * lo pinta: por eso acercarse llenaba la pantalla de ese texto en vez de
     * quedarse en la última foto buena. El servicio «Clarity» de Esri topa en
     * el mismo z17 (z18 ya es 404), o sea que no hay más resolución gratuita
     * disponible en la zona.
     *
     * Con `maxNativeZoom` en 17, Leaflet deja de pedir tiles que no existen y
     * escala el z17 para z18/z19. Se ve más blando al acercar, pero se sigue
     * viendo el techo — que es de lo que va esta capa.
     */
    maxNativeZoom: 17,
  },
}

const SATELLITE_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

/**
 * DESDE QUÉ ZOOM APARECEN LAS REFERENCIAS, Y CON CUÁNTO DETALLE.
 *
 * Son dos umbrales y no uno porque la referencia estorba de dos maneras
 * distintas. Con el pueblo entero en pantalla, veinte discos con su icono y su
 * nombre encima de las calles tapan justo lo que se está mirando; un punto de
 * color, en cambio, ya orienta ("hay algo por ahí") ocupando nueve píxeles.
 * El icono y el nombre entran cuando hay sitio para leerlos.
 *
 * Es el mismo escalón que hace Google Maps entre su POI menor (un punto) y su
 * POI con chapa (círculo de color + rótulo), y por el mismo motivo.
 */
const LANDMARK_MIN_ZOOM = 15
const LANDMARK_LABEL_MIN_ZOOM = 16

/** El nombre lo escribe una persona en el panel, así que no entra crudo al HTML. */
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

/**
 * El marcador de una referencia.
 *
 * NO ES UNA GOTA, Y ESA ES LA DECISIÓN ENTERA. La gota naranja del centro es
 * la puerta del cliente —lo único que esta pantalla le pide— y cualquier otra
 * gota en el mapa compite con ella: misma silueta, mismo tamaño, y el ojo no
 * tiene forma de saber cuál de las tres es la que hay que colocar. Un círculo
 * se lee como "aquí hay un sitio", que es lo que son, y no se confunde con lo
 * que hay que mover. Es el reparto exacto que hace Google Maps entre sus POIs
 * (círculos) y el pin de destino (gota), y no es casualidad que sea el mismo:
 * es el único reparto que deja una sola gota en pantalla.
 *
 * Va como `divIcon` y no como círculo de Leaflet porque el icono y el nombre
 * tienen que viajar juntos como una sola pieza: pegados, alineados y con el
 * mismo halo. Con un círculo + tooltip eran dos elementos que Leaflet coloca
 * por su cuenta, y se despegaban al acercarse.
 *
 * `iconSize: [0, 0]` deja un punto sin dimensiones clavado en la coordenada, y
 * todo lo visible cuelga de él en `position: absolute`. Es lo que permite que
 * el nombre sobresalga a la derecha tanto como necesite sin que Leaflet lo
 * recorte a una caja de tamaño fijo — y sin tener que declarar por adelantado
 * cuánto mide un nombre que escribió una persona en un panel.
 */
function iconoDe(
  l: Landmark,
  /** Chapa de 22 px con su icono; si no, el punto de 11 px. */
  conChapa: boolean,
  /** El nombre escrito al lado. Puede caerse aunque la chapa se quede. */
  conNombre: boolean,
  aLaIzquierda: boolean,
): L.DivIcon {
  const { color, glyph } = LANDMARK_STYLE[l.category]

  // El aro blanco no es adorno: sobre la foto de satélite, un disco de color
  // saturado contra un techo oscuro pierde el borde y se lee como una mancha.
  if (!conChapa) {
    return L.divIcon({
      className: 't-lm',
      html:
        '<span class="t-lm-dot" aria-hidden="true">' +
        '<svg viewBox="0 0 12 12" width="11" height="11">' +
        `<circle cx="6" cy="6" r="4.3" fill="${color}" stroke="#fff" stroke-width="1.5"/>` +
        '</svg></span>',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    })
  }

  return L.divIcon({
    className: 't-lm',
    html:
      '<span class="t-lm-badge" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="22" height="22">' +
      `<circle cx="12" cy="12" r="10.4" fill="${color}" stroke="#fff" stroke-width="1.6"/>` +
      /*
       * El glifo se dibuja en la rejilla de 24 y se encoge al 64% contra el
       * centro del círculo: así los ocho dibujos ocupan la misma proporción de
       * chapa sin tener que authorearlos ya reducidos, cada uno a su manera.
       *
       * `color` además del `fill`: el dibujo hereda blanco por defecto y puede
       * pedir el color de su categoría con `currentColor` cuando necesita las
       * dos tintas (el balón), sin que haya que pasárselo por parámetro.
       */
      `<g fill="#fff" style="color:${color}" transform="translate(12 12) scale(.64) translate(-12 -12)">${glyph}</g>` +
      '</svg></span>' +
      (conNombre
        ? `<span class="t-lm-name${aLaIzquierda ? ' izq' : ''}" style="color:${color}">${escaparHtml(l.name)}</span>`
        : ''),
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

/*
 * ── Reparto de rótulos ──────------------------------------------------------
 *
 * Estas medidas son las de `.t-lm-name` en `globals.css` y no pueden irse cada
 * una por su lado: si allá cambia el `max-width` o el cuerpo de letra y aquí
 * no, el reparto sigue creyendo en cajas de un tamaño que ya no existe y deja
 * de evitar los choques que dice evitar.
 */
const ROTULO_MAX_ANCHO = 116
const ROTULO_ALTO_LINEA = 13
/** Medio disco (11) + el aire que separa el rótulo de su chapa. */
const ROTULO_SEPARACION = 14
/** Radio de la chapa, para que ningún rótulo se pose encima de un icono. */
const CHAPA_RADIO = 11

type Caja = { x1: number; y1: number; x2: number; y2: number }

function chocan(a: Caja, b: Caja): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
}

/**
 * Cuánto mide un nombre escrito, en píxeles.
 *
 * Se mide con canvas y no montando el texto en el DOM porque hay que preguntar
 * por veinte nombres cada vez que el mapa se posa, y veinte inserciones con su
 * lectura de `getBoundingClientRect` son veinte reflows síncronos justo al
 * soltar el dedo. `measureText` no toca el layout.
 *
 * El resultado se guarda por nombre: los nombres no cambian mientras dure la
 * página, así que cada uno se mide UNA vez en toda la sesión.
 */
const anchoDe = (() => {
  const cache = new Map<string, number>()
  let ctx: CanvasRenderingContext2D | null | undefined
  return (nombre: string): number => {
    const guardado = cache.get(nombre)
    if (guardado !== undefined) return guardado
    if (ctx === undefined) {
      ctx = document.createElement('canvas').getContext('2d')
      if (ctx) {
        // La familia se lee del documento en vez de escribirla aquí: la pone el
        // tema, y una copia a mano se queda vieja en silencio el día que cambie.
        ctx.font = `500 11px ${getComputedStyle(document.body).fontFamily}`
      }
    }
    // Sin canvas (navegador raro, contexto perdido) se supone el peor caso: el
    // rótulo se trata como si ocupara el ancho máximo. Eso hace el reparto más
    // conservador —esconde algún nombre de más— pero nunca deja dos encima.
    const ancho = ctx ? Math.ceil(ctx.measureText(nombre).width) : ROTULO_MAX_ANCHO
    cache.set(nombre, ancho)
    return ancho
  }
})()

type Colocacion = { landmark: Landmark; conNombre: boolean; aLaIzquierda: boolean }

/**
 * DECIDE QUÉ NOMBRES SE ESCRIBEN Y DE QUÉ LADO. Es lo que separa un mapa de un
 * montón de marcadores.
 *
 * El problema llega solo con los datos: en cuanto hay dos referencias a media
 * cuadra, sus nombres se montan uno sobre otro y sobre la chapa del vecino, y
 * lo que queda es ilegible para las dos. Google resuelve esto con un repartidor
 * de etiquetas; esto es la versión pequeña del mismo oficio, y basta porque el
 * pueblo entero cabe en decenas de puntos, no en miles.
 *
 * SON DOS REGLAS, Y ESTE ES SU ORDEN:
 *
 *   1. DE QUÉ LADO. Por defecto a la derecha, que es lo que espera quien lee de
 *      izquierda a derecha. Pero un nombre largo pegado al borde derecho de un
 *      teléfono de 390 px se sale de la pantalla y se lee a medias, así que si
 *      no cabe a la derecha se prueba a la izquierda. Google hace exactamente
 *      este volteo, y es la mitad del motivo de que sus mapas se lean.
 *
 *   2. SI CHOCA, NO SE ESCRIBE. Y se cae el NOMBRE, nunca la chapa: la chapa
 *      dice «aquí hay una botica» en 22 px y eso ya orienta; el nombre es el
 *      lujo. Esconder un nombre cuesta un dato, dejar dos superpuestos cuesta
 *      los dos.
 *
 * EL ORDEN DE ATENCIÓN ES POR CERCANÍA AL CENTRO, y no es arbitrario: el centro
 * de este lienzo es donde está el pin, o sea donde la persona está trabajando.
 * Quien gana el sitio cuando hay pelea tiene que ser el de ahí. El desempate
 * por `id` es solo para que el reparto sea estable entre dos pasadas iguales y
 * los nombres no parpadeen al soltar el dedo.
 *
 * Las chapas se reservan TODAS antes de repartir un solo nombre, incluidas las
 * de los que perderán el suyo: un rótulo tapando el icono de otro es el mismo
 * defecto, solo que más difícil de ver.
 */
function repartirRotulos(
  map: L.Map,
  landmarks: readonly Landmark[],
  detallado: boolean,
): Colocacion[] {
  if (!detallado) {
    return landmarks.map((l) => ({ landmark: l, conNombre: false, aLaIzquierda: false }))
  }

  const lienzo = map.getSize()
  const cx = lienzo.x / 2
  const cy = lienzo.y / 2

  const puntos = landmarks.map((l) => {
    const p = map.latLngToContainerPoint([l.lat, l.lng])
    return { l, x: p.x, y: p.y, d: (p.x - cx) ** 2 + (p.y - cy) ** 2 }
  })

  /*
   * Fuera del lienzo no se reparte: nadie los ve, y meterlos en la pelea les
   * daría prioridad sobre los de dentro por el mero hecho de existir. Se les
   * deja el nombre puesto —cuando el mapa se pose tras un arrastre volverán a
   * entrar en el reparto— y así no asoman por el borde sin rótulo.
   */
  const MARGEN = 100
  const dentro = (p: { x: number; y: number }) =>
    p.x >= -MARGEN && p.x <= lienzo.x + MARGEN && p.y >= -MARGEN && p.y <= lienzo.y + MARGEN

  const ocupado: Caja[] = []
  for (const p of puntos) {
    if (!dentro(p)) continue
    ocupado.push({
      x1: p.x - CHAPA_RADIO,
      y1: p.y - CHAPA_RADIO,
      x2: p.x + CHAPA_RADIO,
      y2: p.y + CHAPA_RADIO,
    })
  }

  const porId = new Map<string, Colocacion>()
  const enOrden = [...puntos].sort((a, b) => a.d - b.d || a.l.id.localeCompare(b.l.id))

  for (const p of enOrden) {
    if (!dentro(p)) {
      porId.set(p.l.id, { landmark: p.l, conNombre: true, aLaIzquierda: false })
      continue
    }

    const natural = anchoDe(p.l.name)
    const ancho = Math.min(natural, ROTULO_MAX_ANCHO)
    // Dos líneas exactas: es lo que permite el `-webkit-line-clamp` del CSS.
    const alto = natural > ROTULO_MAX_ANCHO ? ROTULO_ALTO_LINEA * 2 : ROTULO_ALTO_LINEA
    const y1 = p.y - alto / 2
    const y2 = p.y + alto / 2

    const derecha: Caja = {
      x1: p.x + ROTULO_SEPARACION,
      y1,
      x2: p.x + ROTULO_SEPARACION + ancho,
      y2,
    }
    const izquierda: Caja = {
      x1: p.x - ROTULO_SEPARACION - ancho,
      y1,
      x2: p.x - ROTULO_SEPARACION,
      y2,
    }

    const cabe = (c: Caja) =>
      c.x1 >= 4 && c.x2 <= lienzo.x - 4 && !ocupado.some((o) => chocan(c, o))

    let elegida: Caja | null = null
    let aLaIzquierda = false
    if (cabe(derecha)) {
      elegida = derecha
    } else if (cabe(izquierda)) {
      elegida = izquierda
      aLaIzquierda = true
    }

    if (elegida) ocupado.push(elegida)
    porId.set(p.l.id, { landmark: p.l, conNombre: elegida !== null, aLaIzquierda })
  }

  // Se devuelve en el orden de entrada, no en el de la pelea: el orden de
  // pintado de Leaflet no tiene por qué bailar cada vez que el mapa se mueve.
  return landmarks.map(
    (l) => porId.get(l.id) ?? { landmark: l, conNombre: false, aLaIzquierda: false },
  )
}

/**
 * Cuánta holgura se pinta MÁS ALLÁ del borde del lienzo antes de dejar de
 * montar marcadores.
 *
 * Existe porque un marcador que no se ve igual cuesta: su `<div>`, su SVG y su
 * halo de diez sombras están en el DOM y se recomponen con el panel cada vez
 * que el mapa se mueve. Con el pueblo entero cargado —hoy 60 referencias— la
 * postal de 180 px del formulario montaba las 60 para enseñar cuatro.
 *
 * SON DOS HOLGURAS, Y LA DIFERENCIA ES SI EL DEDO PUEDE ARRASTRAR.
 *
 *   - INTERACTIVO: media pantalla, con un piso de 200 px. El reparto solo se
 *     rehace al posarse el mapa (`moveend`), así que lo que no esté montado al
 *     empezar el gesto no aparece hasta soltar. Con media pantalla de colchón
 *     un arrastre normal nunca llega al borde de lo montado, y el que sí llega
 *     —un manotazo largo— rellena al posarse, que es cuando Leaflet trae los
 *     tiles de todas formas.
 *   - POSTAL: 60 px y basta. Ese lienzo va con `interactive: false` y
 *     `pointer-events: none`: no hay gesto que pueda destapar un hueco, así que
 *     la holgura solo cubre el `flyTo` del botón de GPS.
 *
 * Es MÁS ANCHA que el `MARGEN` de `repartirRotulos` a propósito: allá el margen
 * decide quién entra en la pelea por un rótulo, y quien queda fuera conserva su
 * nombre sin comprobar choques. Si el recorte fuera más estrecho que aquel
 * margen, esa holgura sin verificar se vería; siendo más ancho, todo lo que se
 * ve pasó por el reparto igual que antes.
 */
function margenCulling(lienzo: L.Point, interactivo: boolean): number {
  if (!interactivo) return 60
  return Math.max(Math.max(lienzo.x, lienzo.y) / 2, 200)
}

/**
 * Las referencias del pueblo (`map_landmarks`), pintadas por debajo del pin.
 *
 * NUNCA SON TOCABLES (`interactive: false`). El gesto entero de esta pantalla
 * es arrastrar el mapa, y un marcador que captura el puntero se come el
 * arrastre que empieza encima de él — el mismo defecto que ya obligó a sacar
 * el mapa del formulario y llevarlo a pantalla completa. Aquí son decorado
 * que informa, no controles.
 *
 * LO QUE ESTA CAPA NO PUEDE PERMITIRSE.
 *
 * react-leaflet compara TODAS las props por identidad y traduce cada cambio en
 * una llamada imperativa sobre el marcador vivo (ver `updateMarker` en
 * `react-leaflet/lib/Marker.js`). Eso convierte dos descuidos de JavaScript en
 * trabajo de verdad, multiplicado por el número de referencias:
 *
 *   - `position={[l.lat, l.lng]}` escrito en el JSX es un array NUEVO en cada
 *     render, así que `props.position !== prevProps.position` siempre y salían
 *     60 `setLatLng()` por render — incluido cada tecleo en el formulario, que
 *     re-renderiza este árbol entero sin haber tocado el mapa. Por eso las
 *     posiciones viven en un `Map` memoizado: las referencias no se mueven
 *     nunca, así que su array tampoco tiene por qué cambiar.
 *
 *   - un `L.divIcon` nuevo dispara `setIcon()`, y eso NO es barato: Leaflet
 *     rehace el icono con `div.innerHTML = html`, o sea que reparsea el SVG y
 *     vuelve a rasterizar el halo de diez sombras del rótulo. Antes se creaban
 *     los 60 iconos en cada `moveend` aunque el reparto hubiera movido dos, y
 *     el tirón caía justo al soltar el dedo. De ahí la caché: la clave es lo
 *     ÚNICO que cambia el HTML del marcador —chapa, nombre y lado—, así que un
 *     punto colocado igual que en la pasada anterior recibe el MISMO objeto y
 *     react-leaflet no lo toca.
 */
function LandmarkLayer({
  landmarks,
  showLabels,
  interactivo,
}: {
  landmarks: readonly Landmark[]
  showLabels: boolean
  interactivo: boolean
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  /*
   * El reparto de rótulos depende de DÓNDE cae cada punto en el lienzo, así que
   * hay que rehacerlo cuando el lienzo se mueve, no solo cuando cambia el zoom.
   * Esto es un contador y no la posición: lo único que hace falta es un motivo
   * para recalcular, y guardar el centro obligaría a compararlo con épsilones.
   *
   * VA EN `moveend`, NO EN `move`. Es la diferencia entre recalcular una vez al
   * soltar el dedo y hacerlo sesenta veces por segundo mientras se arrastra.
   */
  const [pasada, setPasada] = useState(0)

  /*
   * UN RECÁLCULO POR FOTOGRAMA, NO UNO POR EVENTO.
   *
   * `invalidateSize()` no dispara un evento: dispara DOS. Cuando el tamaño
   * cambió de verdad, Leaflet emite `moveend` y acto seguido `resize` (está a
   * la vista en `invalidateSize`, en leaflet-src). Y como `InvalidateSize`
   * vuelve a medir a los 0, 150 y 450 ms para sobrevivir a la animación del
   * sheet, abrir la pantalla completa costaba hasta SEIS repartos seguidos —
   * todos durante la animación, que es el peor momento para robar hilo
   * principal: es justo lo que hacía que abrir el mapa se sintiera pesado.
   *
   * El `requestAnimationFrame` colapsa cada ráfaga en una sola pasada. No es un
   * debounce con reloj: no añade retraso perceptible, solo se niega a hacer dos
   * veces el mismo trabajo dentro del mismo fotograma.
   */
  const pendiente = useRef<number | null>(null)
  const repintar = useCallback(() => {
    if (pendiente.current != null) return
    pendiente.current = requestAnimationFrame(() => {
      pendiente.current = null
      setPasada((n) => n + 1)
    })
  }, [])
  useEffect(
    () => () => {
      if (pendiente.current != null) cancelAnimationFrame(pendiente.current)
    },
    [],
  )

  useMapEvents({
    zoomend: (e) => setZoom(e.target.getZoom()),
    moveend: repintar,
    /*
     * `resize` NO ES DECORATIVO AQUÍ, es lo que hace que el primer reparto
     * valga. Este lienzo nace dentro de un bottom-sheet que todavía está
     * animando, así que la primera medida del contenedor sale mal y por eso
     * `InvalidateSize` vuelve a medir a los 0, 150 y 450 ms. El reparto se
     * calcula contra el TAMAÑO del lienzo —de ahí sale «no cabe a la derecha»—
     * y sin esta línea se queda con la medida equivocada del montaje: como
     * `moveend` no dispara solo, nada lo corregía hasta que alguien arrastraba
     * el mapa. Se veía como rótulos pisándose en el primer vistazo y
     * colocándose bien al primer toque, que es el peor síntoma posible: el
     * defecto desaparece justo cuando vas a mirarlo.
     */
    resize: repintar,
  })

  const visibles = zoom >= LANDMARK_MIN_ZOOM
  /*
   * UN SOLO INTERRUPTOR PARA LA CHAPA Y PARA EL NOMBRE, y va con el nombre.
   * La chapa de 22 px existe para SOSTENER un rotulo; sin rotulo al lado es
   * una mancha de color grande que no dice más que el punto de 11 px y tapa
   * cuatro veces más mapa. Por eso la vista previa del formulario —que pasa
   * `showLabels: false` porque en 180 px no hay sitio para leer nada— se queda
   * en puntos, que es justo lo que necesita esa postal.
   */
  const detallado = showLabels && zoom >= LANDMARK_LABEL_MIN_ZOOM

  /** El array de cada punto, creado UNA vez. Ver la cabecera del componente. */
  const posiciones = useMemo(() => {
    const m = new Map<string, [number, number]>()
    for (const l of landmarks) m.set(l.id, [l.lat, l.lng])
    return m
  }, [landmarks])

  /*
   * Iconos por clave `id|chapa|nombre|lado`. Sobrevive ENTRE pasadas a
   * propósito: la gracia es justamente que un punto que no cambió de colocación
   * reciba el objeto de la pasada anterior. Se vacía solo si cambia la lista,
   * que es lo único que puede dejar dentro el HTML de un nombre ya editado.
   */
  const cacheIconos = useRef(new Map<string, L.DivIcon>())
  useEffect(() => {
    cacheIconos.current.clear()
  }, [landmarks])

  const marcadores = useMemo(() => {
    if (!visibles) return []
    const lienzo = map.getSize()
    const holgura = margenCulling(lienzo, interactivo)
    const salida: { id: string; pos: [number, number]; icon: L.DivIcon }[] = []

    for (const c of repartirRotulos(map, landmarks, detallado)) {
      const p = map.latLngToContainerPoint([c.landmark.lat, c.landmark.lng])
      if (p.x < -holgura || p.x > lienzo.x + holgura) continue
      if (p.y < -holgura || p.y > lienzo.y + holgura) continue

      const pos = posiciones.get(c.landmark.id)
      if (!pos) continue

      /*
       * LA CHAPA VA CON EL ZOOM, EL NOMBRE CON EL REPARTO. Antes las dos
       * salían de la misma condición y el efecto era el contrario del que se
       * quería: la referencia que perdía el rótulo por un choque perdía TAMBIÉN
       * su icono y caía al punto genérico, o sea que dejaba de decir siquiera
       * de qué categoría era. Perder el nombre cuesta el nombre; no tiene por
       * qué costar «aquí hay una botica».
       */
      const clave = `${c.landmark.id}|${detallado ? 1 : 0}${c.conNombre ? 1 : 0}${
        c.aLaIzquierda ? 1 : 0
      }`
      let icon = cacheIconos.current.get(clave)
      if (!icon) {
        icon = iconoDe(c.landmark, detallado, c.conNombre, c.aLaIzquierda)
        cacheIconos.current.set(clave, icon)
      }

      salida.push({ id: c.landmark.id, pos, icon })
    }
    return salida
    // `pasada` no se lee dentro: está para que el reparto se rehaga cuando el
    // mapa se posa. Sin ella el memo se quedaría con las posiciones del primer
    // encuadre y los rótulos se solaparían en cuanto alguien arrastrara.
    // (Biome no lo marca: no hace falta suprimir nada, solo explicarlo.)
  }, [map, landmarks, detallado, visibles, interactivo, posiciones, pasada])

  if (!visibles) return null

  return (
    <>
      {marcadores.map((m) => (
        <Marker key={m.id} position={m.pos} icon={m.icon} interactive={false} keyboard={false} />
      ))}
    </>
  )
}

/**
 * Marca que el gesto lo hizo una persona.
 *
 * `moveend` no distingue un arrastre del dedo de un `flyTo` del botón de GPS, y
 * la diferencia importa: si el punto viene del GPS la precisión medida sigue
 * siendo válida, y si lo movió el dedo ya no. Leaflet no lo dice, así que se
 * escucha el evento crudo del contenedor. `FlyTo` limpia la marca antes de
 * volar, de modo que un movimiento programático nunca se cuela como manual.
 */
function GestureWatch({ gestureRef }: { gestureRef: RefObject<boolean> }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const mark = () => {
      gestureRef.current = true
    }
    el.addEventListener('touchstart', mark, { passive: true })
    el.addEventListener('mousedown', mark, { passive: true })
    el.addEventListener('wheel', mark, { passive: true })
    return () => {
      el.removeEventListener('touchstart', mark)
      el.removeEventListener('mousedown', mark)
      el.removeEventListener('wheel', mark)
    }
  }, [map, gestureRef])
  return null
}

/**
 * El pin NO se arrastra: está clavado en el centro del lienzo y lo que se mueve
 * es el mapa. La coordenada elegida es siempre `map.getCenter()`, y se reporta
 * al posarse (`moveend`), no en cada frame.
 */
function CenterTracker({
  gestureRef,
  onSettle,
  onMovingChange,
}: {
  gestureRef: RefObject<boolean>
  onSettle: (c: LatLng, byUser: boolean) => void
  onMovingChange: (moving: boolean) => void
}) {
  const map = useMapEvents({
    movestart: () => onMovingChange(true),
    moveend: () => {
      onMovingChange(false)
      const c = map.getCenter()
      const byUser = gestureRef.current
      gestureRef.current = false
      onSettle({ lat: c.lat, lng: c.lng }, byUser)
    },
  })
  return null
}

/** Vuela al objetivo cuando cambia el token (botón de GPS). */
function FlyTo({
  target,
  token,
  gestureRef,
}: {
  target: LatLng
  token: number
  gestureRef: RefObject<boolean>
}) {
  const map = useMap()
  const last = useRef(token)
  useEffect(() => {
    if (token === last.current) return
    last.current = token
    gestureRef.current = false
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.9,
    })
  }, [token, target, map, gestureRef])
  return null
}

/** Solo para la vista previa (no interactiva): sigue al punto elegido sin animar. */
function Follow({ center }: { center: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false })
  }, [center, map])
  return null
}

/**
 * Leaflet mide el contenedor al montar. Dentro de un bottom-sheet que todavía
 * está animando, esa medida sale mal y los tiles quedan a medio pintar.
 */
function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 150)
    const t2 = setTimeout(() => map.invalidateSize(), 450)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map])
  return null
}

/**
 * Las dos curvas del pin, con nombre porque se usan en la sombra y en la gota
 * y tienen que ir sincronizadas: si una rebota y la otra no, la sombra
 * adelanta a su propia gota.
 *
 * Al DESPEGAR se sale rápido y se frena (`SALIDA`): el pin tiene que estar
 * arriba antes de que el dedo haya movido el mapa medio centímetro, o el gesto
 * se siente pegajoso. Al POSARSE rebota (`REBOTE`, un cubic-bezier que se pasa
 * de 1): es lo que da la sensación de peso, y es el momento en que el vecino
 * mira si el pin cayó en su puerta.
 */
const SALIDA = 'cubic-bezier(0.25, 1, 0.5, 1)'
const REBOTE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/**
 * El pin, dibujado FUERA de Leaflet.
 *
 * Va en el wrapper y no como `Marker` a propósito: un marcador vive en el panel
 * del mapa y se desplaza con él, y aquí lo que tiene que quedarse absolutamente
 * quieto es el pin. La sombra se queda clavada en el punto exacto mientras la
 * gota despega: eso es lo que comunica que el mapa se mueve por debajo.
 */
function CenterPin({ moving }: { moving: boolean }) {
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 z-[700]"
      style={{
        transform: 'translate3d(-50%, -50%, 0)',
        WebkitTransform: 'translate3d(-50%, -50%, 0)',
      }}
    >
      {/*
        LA SOMBRA SE QUEDA, LA GOTA DESPEGA. Es lo único que comunica que lo
        que se mueve es el mapa y no el pin: la sombra está clavada en la
        coordenada, así que verla separarse de la punta es ver el suelo correr
        por debajo.

        SOLO SE ANIMAN `transform` Y `opacity`, que el compositor resuelve sin
        volver a maquetar. Animar `width`/`height` —como se hacía— obliga a un
        reflow por fotograma justo mientras el dedo arrastra el mapa, que es el
        único momento en que esta pantalla tiene que ir fina.
      */}
      <span
        className="absolute rounded-[50%]"
        style={{
          width: 22,
          height: 8,
          left: '50%',
          top: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.42) 0%, rgba(15, 23, 42, 0) 75%)',
          transform: `translate3d(-50%, -50%, 0) scale(${moving ? 0.62 : 1})`,
          opacity: moving ? 0.28 : 0.65,
          transition: 'transform 300ms, opacity 300ms',
          transitionTimingFunction: moving ? SALIDA : REBOTE,
        }}
      />
      {/* La gota, con rebote al posarse. */}
      <div
        className="absolute will-change-transform"
        style={{
          left: '50%',
          bottom: 0,
          transform: `translate3d(-50%, ${moving ? -14 : 0}px, 0) scale(${moving ? 1.08 : 1})`,
          transition: 'transform 300ms',
          transitionTimingFunction: moving ? SALIDA : REBOTE,
        }}
      >
        <svg
          width="36"
          height="46"
          viewBox="0 0 34 44"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className="drop-shadow-[0_4px_10px_rgba(249,115,22,0.35)]"
        >
          <title>Punto de entrega</title>
          <defs>
            <linearGradient id="tindivoPinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <path
            d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z"
            fill="url(#tindivoPinGrad)"
            stroke="#ffffff"
            strokeWidth="2.5"
          />
          <circle cx="17" cy="16" r="5" fill="#ffffff" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Lienzo de mapa con el pin fijo al centro. Cargar SOLO vía `next/dynamic` con
 * `ssr: false` (Leaflet toca `window` al importarse).
 *
 * `interactive: false` deja el lienzo inerte: es lo que permite incrustar la
 * vista previa dentro de un formulario con scroll sin que el mapa se coma el
 * gesto del dedo.
 */
function MapCanvas({
  center,
  interactive,
  mode,
  polygon,
  circle,
  bounds,
  flyTarget,
  flyToken = 0,
  onSettle,
  onMovingChange,
  zoom = 17,
  minZoom = 14,
  showPin = true,
  landmarks = [],
}: {
  center: LatLng
  interactive: boolean
  mode: MapMode
  polygon: LatLng[] | null
  circle: { center: LatLng; radiusKm: number } | null
  bounds: MapBounds | null
  flyTarget?: LatLng
  flyToken?: number
  onSettle?: (c: LatLng, byUser: boolean) => void
  onMovingChange?: (moving: boolean) => void
  zoom?: number
  minZoom?: number
  /**
   * Sin punto elegido NO se pinta el pin. Un pin naranja sobre el centro del
   * pueblo se lee como «ya está», y ese malentendido es justo el que hacía que
   * la gente guardara la plaza como su casa.
   */
  showPin?: boolean
  /**
   * Referencias del pueblo (`map_landmarks`). Ver `LandmarkLayer`: los
   * nombres solo se escriben en el lienzo interactivo, porque en la postal de
   * 180px no hay sitio para leerlos sin tapar el mapa entero.
   */
  landmarks?: readonly Landmark[]
}) {
  const gestureRef = useRef(false)
  const [moving, setMoving] = useState(false)
  const tiles = TILES[mode]

  const maxBounds: LatLngBoundsExpression | undefined = useMemo(
    () =>
      bounds
        ? [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
          ]
        : undefined,
    [bounds],
  )

  /*
   * EL ANILLO DE LA ZONA, MEMOIZADO, y no es cosmética.
   *
   * `positions` la compara react-leaflet por identidad igual que la `position`
   * de un marcador (ver `updatePolygon`), así que un `.map()` escrito dentro
   * del JSX significaba `setLatLngs()` en CADA render: Leaflet vuelve a
   * proyectar los vértices —hoy son 51— y reescribe el atributo `d` del path
   * SVG entero. Se pagaba al arrastrar, al abrir el sheet y en cada tecla que
   * alguien escribía en el formulario de dirección, sin que la zona de reparto
   * hubiera cambiado nunca. El polígono llega memoizado desde `MapPicker`, así
   * que esto se calcula una vez por sesión.
   */
  const anillo = useMemo(
    () => polygon?.map((p) => [p.lat, p.lng] as [number, number]) ?? null,
    [polygon],
  )

  const handleMoving = useCallback(
    (m: boolean) => {
      setMoving(m)
      onMovingChange?.(m)
    },
    [onMovingChange],
  )

  const handleSettle = useCallback(
    (c: LatLng, byUser: boolean) => onSettle?.(c, byUser),
    [onSettle],
  )

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={19}
        zoomControl={false}
        attributionControl={interactive}
        // `maxBounds` + viscosidad 1 hace de pared dura: el mapa no deja salir
        // del pueblo. Antes se podía arrastrar el pin hasta Lima y lo único que
        // pasaba era un "fuera de la zona" sin salida.
        maxBounds={maxBounds}
        maxBoundsViscosity={1}
        dragging={interactive}
        touchZoom={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        className={`h-full w-full t-map-${mode} ${interactive ? '' : 'pointer-events-none'}`}
      >
        <TileLayer
          key={mode}
          url={tiles.url}
          attribution={tiles.attribution}
          maxNativeZoom={tiles.maxNativeZoom}
          maxZoom={19}
          subdomains={tiles.subdomains ?? 'abc'}
        />
        {mode === 'satellite' && (
          // La capa de referencia sí responde hasta z19 (tiles de 872 bytes:
          // transparentes donde no hay nada que rotular), así que no necesita
          // el tope de la imagen.
          <TileLayer key="sat-labels" url={SATELLITE_LABELS} maxNativeZoom={19} maxZoom={19} />
        )}
        {anillo ? (
          <Polygon positions={anillo} pathOptions={ZONE_STYLE} />
        ) : circle ? (
          <Circle
            center={[circle.center.lat, circle.center.lng]}
            radius={circle.radiusKm * 1000}
            pathOptions={ZONE_STYLE}
          />
        ) : null}
        {/* Después de la zona y antes del pin: por orden de importancia y, de
            paso, por orden de pintado — las referencias quedan encima de la
            mancha de la zona y siempre por debajo del pin, que vive fuera de
            Leaflet. */}
        {landmarks.length > 0 && (
          <LandmarkLayer landmarks={landmarks} showLabels={interactive} interactivo={interactive} />
        )}
        <InvalidateSize />
        {interactive ? (
          <>
            <GestureWatch gestureRef={gestureRef} />
            <CenterTracker
              gestureRef={gestureRef}
              onSettle={handleSettle}
              onMovingChange={handleMoving}
            />
            {flyTarget && <FlyTo target={flyTarget} token={flyToken} gestureRef={gestureRef} />}
          </>
        ) : (
          <Follow center={center} />
        )}
      </MapContainer>
      {showPin && <CenterPin moving={moving} />}
    </div>
  )
}

/**
 * MEMOIZADO, y el motivo está fuera de este archivo.
 *
 * `MapPicker` vive dentro del formulario de dirección, y `address-sheet.tsx`
 * guarda ese formulario en un solo objeto que reemplaza entero en cada cambio
 * (`patch()` hace `{ ...a, ...p }`). Así que escribir una letra en "Dirección"
 * o en "Referencia" re-renderizaba este árbol completo — Leaflet incluido—
 * aunque `coords` no se hubiera tocado. Cada tecla costaba los `setLatLng()` de
 * todas las referencias y el re-trazado del anillo de la zona.
 *
 * Con las props ya estables aguas arriba (`bounds`, `circle` y `landmarks`
 * memoizados en `MapPicker`; `onSettle` y `onMovingChange` con `useCallback` en
 * `LocationSheet`), la comparación superficial de `memo` corta ese render en
 * seco: el mapa solo se vuelve a pintar cuando algo del mapa cambió.
 *
 * `next/dynamic` toma el `.default` de este módulo, y un componente memoizado
 * funciona igual ahí.
 */
export default memo(MapCanvas)
