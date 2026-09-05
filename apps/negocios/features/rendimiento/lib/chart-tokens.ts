/**
 * Colores de los gráficos del panel de rendimiento.
 *
 * NO son elegidos a ojo: salen de los tokens del design system y pasan los seis
 * chequeos de paleta categórica sobre superficie blanca (validador del método
 * de dataviz, modo claro, `--surface #ffffff`):
 *
 *   Banda de luminosidad  PASS
 *   Piso de croma         PASS
 *   Separación CVD        PASS · peor par ΔE 20.1 (protan) / 30.8 (tritan)
 *   Piso visión normal    PASS · ΔE 29.2
 *   Contraste vs fondo    PASS · 5.18:1 y 5.93:1 (ambos ≥ 3:1)
 *
 * Los tonos «vivos» del sistema (--color-brand #f97316, --color-info #0ea5e9)
 * se quedan fuera de las marcas de datos a propósito: miden 2.80:1 y 2.77:1
 * sobre blanco, por debajo del mínimo de 3:1, y obligarían a muletas de
 * etiquetado en todas partes. Siguen usándose para acentos de UI, que es donde
 * el contraste no decide si el dato se lee.
 *
 * Si tocas un valor, vuelve a pasar el validador antes de commitear.
 */

/** Slot 1 — la serie protagonista y la barra destacada. `--color-brand-dark`. */
export const CHART_ACCENT = '#c2410c'

/** Slot 2 — la segunda identidad (clientes que ya habían pedido). */
export const CHART_SECOND = '#0369a1'

/** Contexto: las barras que no son la historia. Se leen por su etiqueta. */
export const CHART_MUTED = '#d6d3d1'

/** Rejilla y ejes: un paso por encima de la superficie, hairline y sólidos. */
export const CHART_GRID = '#eae7e2'

/** El hueco de 2px en color de superficie que separa marcas que se tocan. */
export const CHART_SURFACE = '#ffffff'
