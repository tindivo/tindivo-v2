/**
 * Geometría de los gráficos del reporte de rendimiento.
 *
 * Vive aquí, y no en cada renderizador, porque el panel (React/SVG) y el PDF
 * (HTML/SVG servido por Puppeteer) dibujan la MISMA serie. Con dos cálculos
 * separados, el día que uno cambie de escala el negocio vería dos formas
 * distintas de la misma semana y no habría manera de saber cuál miente.
 *
 * Puro: números entran, números y `path` salen. Sin DOM.
 */

export interface ChartBox {
  width: number
  height: number
  /** Margen interior para que el trazo no se coma el borde ni las etiquetas. */
  padTop: number
  padBottom: number
  padLeft: number
  padRight: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Tope del eje redondeado «hacia arriba bonito», para que las marcas caigan en
 * números que una persona lee de un vistazo y no en 3,847.
 *
 * Los escalones incluyen 1.5 / 3 / 4 además de los clásicos 1 / 2 / 2.5 / 5.
 * Con solo los clásicos, un máximo de 269 saltaba a 500 y la serie se quedaba
 * pintada en la mitad inferior del recuadro, desperdiciando la altura que es
 * justo lo que deja ver la variación. Con 3 disponible, 269 → 300.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 10] as const

export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const mag = 10 ** exp
  const norm = value / mag
  const step = NICE_STEPS.find((s) => norm <= s) ?? 10
  return step * mag
}

/** Marcas del eje Y: siempre 0 y el tope, con `count` divisiones. */
export function axisTicks(max: number, count = 2): number[] {
  const out: number[] = []
  for (let i = 0; i <= count; i++) out.push((max / count) * i)
  return out
}

/** Proyecta valores a coordenadas del SVG (y crece hacia abajo). */
export function projectSeries(values: number[], max: number, box: ChartBox): Point[] {
  const plotW = box.width - box.padLeft - box.padRight
  const plotH = box.height - box.padTop - box.padBottom
  const safeMax = max > 0 ? max : 1
  const denom = values.length > 1 ? values.length - 1 : 1
  return values.map((v, i) => ({
    x: box.padLeft + (values.length > 1 ? (plotW * i) / denom : plotW / 2),
    y: box.padTop + plotH - (Math.max(0, v) / safeMax) * plotH,
  }))
}

/** Polilínea recta. Sin curvas: una spline inventa valores entre dos días. */
export function linePath(points: Point[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`).join(' ')
}

/** El mismo trazo cerrado contra la base, para el relleno al 10%. */
export function areaPath(points: Point[], box: ChartBox): string {
  if (points.length === 0) return ''
  const base = box.height - box.padBottom
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return `${linePath(points)} L${r(last.x)},${r(base)} L${r(first.x)},${r(base)} Z`
}

export interface BandBar {
  /** Índice original en la serie de entrada (para recuperar la etiqueta). */
  index: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Columnas en bandas de igual ancho. La barra ocupa `barRatio` de su banda y el
 * resto queda en aire: nunca llena la banda entera (marcas finas, ver
 * `marks-and-anatomy`), y el hueco es lo que separa vecinas — no un borde.
 */
export function bandBars(
  values: number[],
  max: number,
  box: ChartBox,
  barRatio = 0.55,
  maxBarWidth = 24,
): BandBar[] {
  const plotW = box.width - box.padLeft - box.padRight
  const plotH = box.height - box.padTop - box.padBottom
  const safeMax = max > 0 ? max : 1
  const band = plotW / Math.max(1, values.length)
  const width = Math.min(band * barRatio, maxBarWidth)
  return values.map((v, i) => {
    const h = (Math.max(0, v) / safeMax) * plotH
    return {
      index: i,
      x: box.padLeft + band * i + (band - width) / 2,
      y: box.padTop + plotH - h,
      width,
      height: h,
    }
  })
}

/**
 * Barra apilada horizontal de dos tramos, con el hueco de 2px de superficie
 * entre ellos. Devuelve anchos ya descontado el hueco, para que la suma no se
 * pase del contenedor cuando los dos tramos tienen valor.
 */
export function stackedPair(
  a: number,
  b: number,
  totalWidth: number,
  gap = 2,
): { aWidth: number; bWidth: number; gap: number } {
  const total = a + b
  if (total <= 0) return { aWidth: 0, bWidth: 0, gap: 0 }
  const bothPresent = a > 0 && b > 0
  const usable = bothPresent ? totalWidth - gap : totalWidth
  return {
    aWidth: r((a / total) * usable),
    bWidth: r((b / total) * usable),
    gap: bothPresent ? gap : 0,
  }
}

function r(n: number): number {
  return Math.round(n * 100) / 100
}
