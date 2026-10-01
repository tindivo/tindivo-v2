'use client'

import L from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'
import { escaparHtml } from './html'
import { LANDMARK_STYLE, type Landmark } from './landmarks'
import type { RoutePin } from './route-types'

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

type Colocacion = {
  landmark: Landmark
  conNombre: boolean
  aLaIzquierda: boolean
  /** Su chapa cae bajo un pin de ruta o su globo: no se pinta (ver `cajasDePines`). */
  oculto?: boolean
}

/*
 * Medidas de los pines de ruta, las de `.t-route-pin-*` y `.t-route-driver` en
 * `map.css` y el SVG de `routePinIcono`. Mismo pacto que las de los rótulos:
 * si allá cambian, aquí también.
 */
const GOTA_ANCHO = 30
const GOTA_ALTO = 38
/** El globo del nombre: su base queda 44 px por encima de la punta de la gota. */
const GLOBO_SEPARACION = 44
const GLOBO_ALTO = 20
const GLOBO_PADDING_X = 8
const GLOBO_MAX_ANCHO = 150
const PILDORA_ALTO = 26
/** Icono (14) + hueco (4) + padding horizontal (10 + 10) de la píldora del motorizado. */
const PILDORA_EXTRA = 38

/**
 * LO QUE OCUPA CADA PIN DE RUTA EN EL LIENZO: la gota y, encima, el globo con
 * su nombre (o la píldora del motorizado).
 *
 * Los pines A/B son lo que la pantalla quiere decir; las referencias, contexto.
 * Por eso el reparto los mete como espacio OCUPADO antes de colocar un solo
 * rótulo: el nombre de una referencia que choca con un pin se voltea o se cae,
 * nunca al revés. Y una CHAPA que cae debajo de la gota o de su globo no se
 * pinta: bajo la gota es la misma esquina dicha dos veces (la botica donde el
 * cliente puso su pin), y bajo el globo quedaría a medio tapar, que es justo
 * el amontonamiento que esto viene a quitar.
 *
 * El ancho del globo sale de `anchoDe`, que mide a peso 500; el globo va a
 * 600. Los 4 px de más cubren esa diferencia sin montar otro canvas.
 */
function cajasDePines(map: L.Map, pines: readonly RoutePin[]): Caja[] {
  const todas: Caja[] = []
  for (const pin of pines) {
    const p = map.latLngToContainerPoint([pin.coordinates.lat, pin.coordinates.lng])
    if (pin.variant === 'driver') {
      const ancho = (pin.label ? anchoDe(pin.label) + 4 : 0) + PILDORA_EXTRA
      const pildora = {
        x1: p.x - ancho / 2,
        y1: p.y - PILDORA_ALTO / 2,
        x2: p.x + ancho / 2,
        y2: p.y + PILDORA_ALTO / 2,
      }
      todas.push(pildora)
      continue
    }
    const gota = {
      x1: p.x - GOTA_ANCHO / 2,
      y1: p.y - GOTA_ALTO,
      x2: p.x + GOTA_ANCHO / 2,
      y2: p.y,
    }
    todas.push(gota)
    if (pin.label) {
      const ancho = Math.min(anchoDe(pin.label) + 4 + GLOBO_PADDING_X * 2, GLOBO_MAX_ANCHO)
      todas.push({
        x1: p.x - ancho / 2,
        y1: p.y - GLOBO_SEPARACION - GLOBO_ALTO,
        x2: p.x + ancho / 2,
        y2: p.y - GLOBO_SEPARACION,
      })
    }
  }
  return todas
}

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
  pines: readonly RoutePin[] = [],
): Colocacion[] {
  const ocupadoPorPines = cajasDePines(map, pines)
  const bajoUnPin = (l: Landmark) => {
    if (ocupadoPorPines.length === 0) return false
    const p = map.latLngToContainerPoint([l.lat, l.lng])
    const chapa = {
      x1: p.x - CHAPA_RADIO,
      y1: p.y - CHAPA_RADIO,
      x2: p.x + CHAPA_RADIO,
      y2: p.y + CHAPA_RADIO,
    }
    return ocupadoPorPines.some((c) => chocan(chapa, c))
  }

  if (!detallado) {
    return landmarks.map((l) => ({
      landmark: l,
      conNombre: false,
      aLaIzquierda: false,
      oculto: bajoUnPin(l),
    }))
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
   * daría prioridad sobre los de dentro por el mero hecho de existir. Van sin
   * nombre; cuando el mapa se pose tras un arrastre vuelven a entrar en el
   * reparto y lo recuperan.
   */
  const MARGEN = 100
  const dentro = (p: { x: number; y: number }) =>
    p.x >= -MARGEN && p.x <= lienzo.x + MARGEN && p.y >= -MARGEN && p.y <= lienzo.y + MARGEN

  // Los pines de ruta primero: son lo que manda en la pantalla.
  const ocupado: Caja[] = [...ocupadoPorPines]
  const ocultos = new Set(puntos.filter((p) => bajoUnPin(p.l)).map((p) => p.l.id))
  for (const p of puntos) {
    if (!dentro(p) || ocultos.has(p.l.id)) continue
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
    if (ocultos.has(p.l.id)) {
      porId.set(p.l.id, { landmark: p.l, conNombre: false, aLaIzquierda: false, oculto: true })
      continue
    }
    if (!dentro(p)) {
      // Sin nombre: nadie lo ve, y un nombre sin revisar a la orilla se
      // asomaba encima de lo que hubiera dentro (lo caza
      // `mapa-reparto-de-rotulos.spec.ts`). Lo recupera en cuanto el mapa se
      // posa con él dentro.
      porId.set(p.l.id, { landmark: p.l, conNombre: false, aLaIzquierda: false })
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
const SIN_PINES: readonly RoutePin[] = []

export function LandmarkLayer({
  landmarks,
  showLabels,
  interactivo,
  pines = SIN_PINES,
}: {
  landmarks: readonly Landmark[]
  showLabels: boolean
  interactivo: boolean
  /**
   * Los pines de ruta del mismo mapa (A, B, el motorizado). Ningún rótulo de
   * referencia se monta encima de ellos ni de su globo (ver `cajasDePines`).
   */
  pines?: readonly RoutePin[]
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  /*
   * Los pines llegan como array y el padre puede crearlo nuevo en cada render
   * (un `routePins = []` por defecto, un `.map` en el JSX). Comparados por
   * identidad, cada tecla del formulario rehacía el reparto entero. Se
   * comparan por CONTENIDO: solo un pin que se mueve o cambia de nombre cuenta.
   */
  const clavePines = pines
    .map((p) => `${p.id}:${p.variant}:${p.label ?? ''}:${p.coordinates.lat},${p.coordinates.lng}`)
    .join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: `clavePines` resume `pines` por contenido.
  const pinesEstables = useMemo(() => pines, [clavePines])
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `landmarks` es el disparador, no se lee.
  useEffect(() => {
    cacheIconos.current.clear()
  }, [landmarks])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `pasada` rehace el reparto al posarse el mapa (ver abajo).
  const marcadores = useMemo(() => {
    if (!visibles) return []
    const lienzo = map.getSize()
    const holgura = margenCulling(lienzo, interactivo)
    const salida: { id: string; pos: [number, number]; icon: L.DivIcon }[] = []

    for (const c of repartirRotulos(map, landmarks, detallado, pinesEstables)) {
      if (c.oculto) continue
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
  }, [map, landmarks, detallado, visibles, interactivo, posiciones, pasada, pinesEstables])

  if (!visibles) return null

  return (
    <>
      {marcadores.map((m) => (
        <Marker key={m.id} position={m.pos} icon={m.icon} interactive={false} keyboard={false} />
      ))}
    </>
  )
}
