import {
  areaPath,
  bandBars,
  bestWeekdayByTicket,
  buildGoal,
  buildInsights,
  buildMood,
  type ChartBox,
  computeDelta,
  computePerNightDelta,
  type Delta,
  fmtOrders,
  fmtPct,
  linePath,
  type MoodLevel,
  niceMax,
  type PerformancePayload,
  perNight,
  plural,
  projectSeries,
  stackedPair,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_SHORT,
} from '@tindivo/core'
import { GEIST_WOFF2, JETBRAINS_MONO_WOFF2, TINDIVO_MARK_PNG } from './brand-assets'
import { launchBrowser } from './browser'

/**
 * Los MISMOS valores validados que usa el panel
 * (`features/rendimiento/lib/chart-tokens.ts`) y que declara el design system
 * (`packages/ui/src/theme.css`). Se repiten aquí porque `apps/api` no depende
 * ni de `apps/negocios` ni de `packages/ui` — pero si cambias uno, cambia el
 * otro y vuelve a pasar el validador de paleta.
 */
const ACCENT = '#c2410c'
const SECOND = '#0369a1'
const MUTED = '#d6d3d1'
const GRID = '#eae7e2'

function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

/**
 * Flecha «a», dibujada. U+2192 NO está en el subset latin de Geist, y aparece
 * en un insight vivo de `buildInsights` («7.4 -> 6 por noche»). En una máquina
 * de escritorio se ve igual, porque el sistema presta el glifo de otra fuente;
 * en el contenedor de producción, donde solo hay Open Sans, sale un cuadrado.
 */
const ARROW_RIGHT_SVG =
  '<svg viewBox="0 0 12 10" width="9" height="8" style="display:inline-block;vertical-align:-0.5px" aria-hidden="true"><path d="M0.6 5h9M6.6 1.4 10.6 5l-4 3.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * ¿Tiene la fuente embebida un glifo para este carácter?
 *
 * Los rangos salen del `unicode-range` que declara Google Fonts para el subset
 * «latin» que se descargó a `assets/`. Si cambias el fichero de fuente, esto
 * hay que revisarlo.
 */
function tieneGlifo(cp: number): boolean {
  if (cp <= 0xff) return true
  if (cp >= 0x2000 && cp <= 0x206f) return true
  return [
    0x131, 0x152, 0x153, 0x2bb, 0x2bc, 0x2c6, 0x2da, 0x2dc, 0x304, 0x308, 0x329, 0x20ac, 0x2122,
    0x2191, 0x2193, 0x2212, 0x2215, 0xfffd,
  ].includes(cp)
}

/**
 * Escapa HTML y, además, VIGILA LOS GLIFOS.
 *
 * Lo segundo no es paranoia: este documento ya se rompió dos veces por lo
 * mismo. Las caritas de `buildMood` y las flechas de las variaciones salían
 * como cuadrados vacíos en producción, y no se veía en ninguna revisión porque
 * en local el sistema presta el glifo que falte. El texto de los insights viene
 * de `packages/core`, que lo escribe pensando en el navegador, así que un
 * cambio de copy allí puede volver a meter un carácter que aquí no existe.
 *
 * Los que sí se pueden dibujar se sustituyen. El resto NO se toca —mutilar el
 * texto de un reporte que el negocio archiva es peor que un cuadrado— pero deja
 * un aviso en el log, que es lo que convierte esto en algo que alguien puede
 * arreglar en vez de un fallo que nadie ve.
 */
function esc(s: string): string {
  const escapado = s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
  let salida = ''
  for (const ch of escapado) {
    const cp = ch.codePointAt(0) ?? 0
    if (tieneGlifo(cp)) {
      salida += ch
      continue
    }
    if (ch === '→') {
      salida += ARROW_RIGHT_SVG
      continue
    }
    console.warn(
      `[api][pdf] carácter sin glifo en la fuente embebida: ${ch} (U+${cp.toString(16).toUpperCase().padStart(4, '0')}). Saldrá como un cuadrado en producción.`,
    )
    salida += ch
  }
  return salida
}

function dayLabel(iso: string): string {
  const p = iso.split('-')
  return `${p[2]}/${p[1]}`
}

// ── Marca ────────────────────────────────────────────────────────────────────

/**
 * Tipografía y glifos: por qué esto NO es cosmética.
 *
 * El Chromium de producción (`@sparticuz/chromium`) trae exactamente TRES
 * fuentes dentro de `fonts.tar.br`: Open Sans Regular, Bold e Italic. Ni una
 * más. Eso tiene dos consecuencias que solo se ven en el PDF desplegado, nunca
 * en local, donde el Chrome de la máquina tiene de todo:
 *
 *   1. Cualquier pila tipográfica (`-apple-system`, `Segoe UI`, `Roboto`…) cae
 *      entera a Open Sans. También la `monospace` de los importes — o sea que
 *      las columnas de dinero perdían la alineación tabular que justificaba
 *      ponerlas en mono.
 *   2. NO hay fuente de emoji. Las cinco caritas de `buildMood` y las flechas
 *      ▲▼ de las variaciones salían como cuadraditos vacíos.
 *
 * Por eso Geist y JetBrains Mono van embebidas (las mismas familias que declara
 * `theme.css`, así el papel y la pantalla se ven igual), y por eso las flechas y
 * las caritas se dibujan en SVG en vez de escribirse como texto: un glifo que
 * dibujas tú no depende de qué fuentes haya en el contenedor.
 */
const FONT_FACES = `
  @font-face{font-family:'Geist';src:url("${GEIST_WOFF2}") format('woff2');font-weight:400 800;font-style:normal;font-display:block}
  @font-face{font-family:'JetBrains Mono';src:url("${JETBRAINS_MONO_WOFF2}") format('woff2');font-weight:500 700;font-style:normal;font-display:block}
`

/** Cabecera de marca. El isotipo real, no un texto que lo imite. */
function brandBar(): string {
  return `<div class="brandbar">
    <div class="brandbar-id">
      <img class="mark" src="${TINDIVO_MARK_PNG}" alt=""/>
      <div>
        <div class="wordmark">Tindivo</div>
        <div class="eyebrow">Reporte de negocio</div>
      </div>
    </div>
    <div class="brandbar-meta">San Jacinto, Áncash</div>
  </div>`
}

/**
 * Las cinco caritas de `buildMood`, dibujadas. El nivel manda, no el emoji:
 * `mood.emoji` sigue existiendo en el payload y lo usa el panel, pero aquí no
 * se puede pintar (ver `FONT_FACES`).
 *
 * Ojo con un matiz que se pierde a propósito: `soft` cubre dos casos y en el
 * panel son 🌙 (cerraste muchas noches) y 😕 (bajó la cosa). Aquí los dos dan la
 * misma cara. El titular de al lado ya distingue cuál es, así que la carita no
 * carga con esa información.
 */
const MOOD_FACE: Record<MoodLevel, { color: string; mouth: string }> = {
  celebrating: { color: '#16a34a', mouth: 'M8 14.5 Q12 19 16 14.5' },
  good: { color: '#16a34a', mouth: 'M8.5 14.5 Q12 17.5 15.5 14.5' },
  steady: { color: '#57534e', mouth: 'M8.5 15.2 L15.5 15.2' },
  soft: { color: '#f59e0b', mouth: 'M8.5 16.2 Q12 13.6 15.5 16.2' },
  worried: { color: '#f97316', mouth: 'M8.5 16.8 Q12 13 15.5 16.8' },
}

function moodFaceSvg(level: MoodLevel): string {
  const face = MOOD_FACE[level]
  return `<svg class="mood-face" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <circle cx="12" cy="12" r="10.4" fill="none" stroke="${face.color}" stroke-width="1.6"/>
    <circle cx="8.9" cy="9.9" r="1.25" fill="${face.color}"/>
    <circle cx="15.1" cy="9.9" r="1.25" fill="${face.color}"/>
    <path d="${face.mouth}" fill="none" stroke="${face.color}" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`
}

/** Triángulo de variación. Dibujado, no escrito: ▲/▼ no existen en la fuente. */
function arrowSvg(up: boolean, color: string): string {
  const d = up ? 'M5 1.6 L9.2 8 L0.8 8 Z' : 'M5 8.4 L0.8 2 L9.2 2 Z'
  return `<svg class="arrow" viewBox="0 0 10 10" width="7" height="7" aria-hidden="true"><path d="${d}" fill="${color}"/></svg>`
}

/** Insignia de variación. Sin periodo previo se dice, no se inventa un número. */
/**
 * `label` rotula QUÉ mide el porcentaje cuando no mide lo mismo que la cifra
 * que tiene encima. Desde la 0222 es el caso normal: arriba va el total del
 * periodo y la variación se calcula por noche trabajada. Sin el rótulo, un
 * «▲ 11%» junto a un total se lee como que la facturación subió un 11%, y no
 * es lo que se está diciendo.
 */
function deltaChip(delta: Delta, upIsGood = true, label?: string): string {
  const suf = label ? ` ${esc(label)}` : ''
  if (!delta.comparable || delta.pct === null) {
    return `<span class="chip chip-flat">Sin periodo previo</span>`
  }
  if (delta.direction === 'flat') {
    return `<span class="chip chip-flat">Igual que antes</span>`
  }
  const subio = delta.direction === 'up'
  const bueno = subio === upIsGood
  const color = bueno ? '#15803d' : '#b91c1c'
  return `<span class="chip ${bueno ? 'chip-good' : 'chip-bad'}">${arrowSvg(subio, color)}${fmtPct(delta.pct)}${suf}</span>`
}

// ── Gráficos (SVG estático, misma geometría que el panel) ────────────────────

const TREND_BOX: ChartBox = {
  width: 660,
  height: 132,
  padTop: 20,
  padBottom: 24,
  padLeft: 8,
  padRight: 8,
}

function trendSvg(daily: PerformancePayload['daily']): string {
  if (daily.length < 3) return ''
  const values = daily.map((d) => d.revenue)
  const tope = Math.max(...values)
  // Ni un sol facturado en todo el rango. Aquí no se puede dibujar una escala:
  // `niceMax(0)` devuelve 1 —su tope de seguridad para no dividir entre cero—,
  // así que el eje sale rotulado «0 / S/ 1 / S/ 1», con dos etiquetas idénticas
  // porque las marcas son 0, 0.5 y 1 y las dos últimas redondean al mismo
  // entero. Y debajo, una línea plana pegada al suelo.
  //
  // Eso no es un gráfico vacío: es un gráfico que MIENTE sobre su escala, y le
  // toca justo a quien no vendió nada, que es la pantalla que más cuidado
  // merece. Mismo criterio que con menos de tres jornadas: no se finge.
  if (tope === 0) return '<p class="muted small">Ningún día con ventas en este rango.</p>'
  const max = niceMax(tope)
  const pts = projectSeries(values, max, TREND_BOX)
  const plotH = TREND_BOX.height - TREND_BOX.padTop - TREND_BOX.padBottom
  const peak = values.indexOf(Math.max(...values))
  const peakPt = pts[peak]

  const grid = [0, max / 2, max]
    .map((t) => {
      const y = TREND_BOX.padTop + plotH - (t / max) * plotH
      return `<line x1="${TREND_BOX.padLeft}" y1="${y}" x2="${TREND_BOX.width - TREND_BOX.padRight}" y2="${y}" stroke="${GRID}" stroke-width="1"/>
        <text x="${TREND_BOX.padLeft}" y="${y - 4}" font-size="9" fill="#a8a29e">${t === 0 ? '0' : `S/ ${Math.round(t)}`}</text>`
    })
    .join('')

  const xLabels = [0, peak, daily.length - 1]
    .filter((i, idx, arr) => arr.indexOf(i) === idx)
    .map((i) => {
      const p = pts[i]
      if (!p) return ''
      const anchor = i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'middle'
      return `<text x="${p.x}" y="${TREND_BOX.height - 8}" font-size="9" fill="#a8a29e" text-anchor="${anchor}">${dayLabel(daily[i]?.date ?? '')}</text>`
    })
    .join('')

  const peakMark = peakPt
    ? `<circle cx="${peakPt.x}" cy="${peakPt.y}" r="4.5" fill="${ACCENT}" stroke="#ffffff" stroke-width="2"/>
       <text x="${peakPt.x}" y="${peakPt.y - 10}" font-size="10" font-weight="700" fill="#1a1614" text-anchor="middle">${soles(daily[peak]?.revenue ?? 0)}</text>`
    : ''

  return `<svg viewBox="0 0 ${TREND_BOX.width} ${TREND_BOX.height}" width="100%">
    ${grid}
    <path d="${areaPath(pts, TREND_BOX)}" fill="${ACCENT}" fill-opacity="0.1"/>
    <path d="${linePath(pts)}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${peakMark}
    ${xLabels}
  </svg>`
}

const WEEK_BOX: ChartBox = {
  width: 320,
  height: 118,
  padTop: 18,
  padBottom: 22,
  padLeft: 4,
  padRight: 4,
}

function weekdaySvg(weekday: PerformancePayload['weekday']): string {
  const total = weekday.reduce((s, w) => s + w.orders, 0)
  if (total === 0) return '<p class="muted small">Sin historial suficiente todavía.</p>'

  const ordered = WEEKDAY_DISPLAY_ORDER.map(
    (dow) => weekday.find((w) => w.dow === dow) ?? { dow, orders: 0, revenue: 0, ticket: 0 },
  )
  const best = bestWeekdayByTicket(weekday)
  const values = ordered.map((w) => w.ticket)
  const max = niceMax(Math.max(...values))
  const bars = bandBars(values, max, WEEK_BOX, 0.5, 20)
  const baseline = WEEK_BOX.height - WEEK_BOX.padBottom

  const marks = bars
    .map((bar, i) => {
      const day = ordered[i]
      if (!day) return ''
      const esFuerte = best?.dow === day.dow
      const label = esFuerte
        ? `<text x="${bar.x + bar.width / 2}" y="${bar.y - 5}" font-size="9" font-weight="700" fill="#1a1614" text-anchor="middle">S/ ${day.ticket.toFixed(0)}</text>`
        : ''
      return `${label}
        <rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${Math.max(bar.height, day.orders > 0 ? 2 : 0)}" rx="4" fill="${esFuerte ? ACCENT : MUTED}"/>
        <text x="${bar.x + bar.width / 2}" y="${WEEK_BOX.height - 7}" font-size="9" fill="${esFuerte ? '#1a1614' : '#a8a29e'}" font-weight="${esFuerte ? 700 : 400}" text-anchor="middle">${WEEKDAY_SHORT[day.dow]}</text>`
    })
    .join('')

  return `<svg viewBox="0 0 ${WEEK_BOX.width} ${WEEK_BOX.height}" width="100%">
    <line x1="${WEEK_BOX.padLeft}" y1="${baseline}" x2="${WEEK_BOX.width - WEEK_BOX.padRight}" y2="${baseline}" stroke="${GRID}" stroke-width="1"/>
    ${marks}
  </svg>`
}

function customerSvg(customers: PerformancePayload['customers']): string {
  const track = 300
  const h = 20
  const { aWidth, bWidth, gap } = stackedPair(customers.new, customers.returning, track)
  if (aWidth === 0 && bWidth === 0) return ''
  return `<svg viewBox="0 0 ${track} ${h}" width="100%">
    ${aWidth > 0 ? `<rect x="0" y="0" width="${aWidth}" height="${h}" rx="4" fill="${ACCENT}"/>` : ''}
    ${bWidth > 0 ? `<rect x="${aWidth + gap}" y="0" width="${bWidth}" height="${h}" rx="4" fill="${SECOND}"/>` : ''}
  </svg>`
}

// ── Documento ────────────────────────────────────────────────────────────────

interface ReportParams {
  businessName: string
  rangeLabel: string
  data: PerformancePayload
}

function buildHtml({ businessName, rangeLabel, data }: ReportParams): string {
  const generatedAt = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date())

  // Por noche trabajada, igual que el panel: dos ventanas del mismo largo casi
  // nunca han trabajado las mismas noches, y comparar sus totales puede
  // invertir el signo de la realidad. El ticket ya es una media por pedido, así
  // que ese se compara tal cual.
  const revDelta = computePerNightDelta(
    data.current.revenue,
    data.current.nights,
    data.previous.revenue,
    data.previous.nights,
  )
  const ticketDelta = computeDelta(data.current.ticket, data.previous.ticket)
  const netIncome = Math.max(0, data.current.revenue - data.bill.commission)
  const insights = buildInsights(data)
  const mood = buildMood(data)
  const goal = buildGoal(data)
  const cust = data.customers
  const tasaRetorno = cust.total > 0 ? (cust.returning / cust.total) * 100 : 0

  const billRows = [
    { label: 'Comisión del servicio', value: data.bill.commission },
    { label: 'Envíos que cobraste y entregas', value: data.bill.deliveryFee },
    { label: 'Devoluciones', value: data.bill.refund },
  ].filter((r) => r.value > 0)

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><style>
  ${FONT_FACES}

  /* Tokens del design system (packages/ui/src/theme.css), copiados porque
     apps/api no depende de packages/ui. Si cambian allí, cambian aquí. */
  :root{
    --brand:#f97316; --brand-dark:#c2410c; --brand-light:#fed7aa; --brand-soft:#fff7ed;
    --ink:#1a1614; --ink-muted:#57534e; --ink-subtle:#a8a29e;
    --surface:#faf6f1; --card:#ffffff; --border:#eae7e2; --rule:#f1f1ef;
    --success:#16a34a; --success-soft:#dcfce7; --success-ink:#15803d;
    --warning:#f59e0b; --warning-soft:#fef3c7;
    --danger:#dc2626; --danger-soft:#fee2e2; --danger-ink:#b91c1c;
  }

  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0}
  body{font-family:'Geist',system-ui,sans-serif;color:var(--ink);width:210mm;padding:0 13mm;
       font-variant-ligatures:none}
  .muted{color:var(--ink-muted)}
  .small{font-size:11px}
  /* tabular-nums es la razón de ser de la mono: que los importes de una
     columna caigan alineados dígito con dígito. En producción no pasaba, porque
     no había ninguna mono instalada y caía a Open Sans proporcional. */
  .mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;
        font-weight:500;letter-spacing:-.01em}
  h1{font-size:21px;font-weight:800;margin:0 0 3px;letter-spacing:-.02em}
  h2{font-size:13px;font-weight:800;margin:0}
  .sub{font-size:11px;color:var(--ink-muted);margin:0}

  /* ── Cabecera de marca ── */
  .brandbar{display:flex;justify-content:space-between;align-items:center;
            padding-bottom:7px;border-bottom:2.5px solid var(--brand);margin-bottom:11px}
  .brandbar-id{display:flex;align-items:center;gap:9px}
  .mark{width:31px;height:31px;border-radius:7px;display:block}
  .wordmark{font-size:17px;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:var(--ink)}
  .eyebrow{font-size:8.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-subtle);
           font-weight:600;margin-top:2px}
  .brandbar-meta{font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-subtle);
                 font-weight:600}

  .titleblock{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:11px}
  .badge{display:inline-block;margin-top:6px;padding:2.5px 10px;border-radius:999px;
         background:var(--brand-soft);color:var(--brand-dark);font-size:10px;font-weight:700;
         border:1px solid var(--brand-light)}
  .biz{font-size:13px;font-weight:700;color:var(--ink);margin:0}

  .kpis{display:flex;gap:9px;margin-bottom:10px}
  .kpi{flex:1;border:1px solid var(--border);border-radius:12px;padding:11px 13px;background:var(--card)}
  .kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-muted);font-weight:700}
  .kpi-value{font-size:22px;font-weight:800;margin-top:4px;letter-spacing:-.03em;
             font-variant-numeric:tabular-nums}
  .kpi-foot{margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .chip{display:inline-flex;align-items:center;gap:3.5px;padding:1.5px 7px;border-radius:999px;
        font-size:10px;font-weight:700}
  .arrow{display:block;flex:0 0 auto}
  .chip-good{background:var(--success-soft);color:var(--success-ink)}
  .chip-bad{background:var(--danger-soft);color:var(--danger-ink)}
  .chip-flat{background:var(--surface);color:var(--ink-muted)}
  .card{border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-bottom:9px;
        background:var(--card)}
  .row2{display:flex;gap:10px;margin-bottom:9px}
  .row2>.card{flex:1;margin-bottom:0}
  .ins{display:flex;gap:8px;border:1px solid;border-radius:10px;padding:8px 10px;margin-top:7px}
  .ins-good{background:#f0fdf4;border-color:#bbf7d0}
  .ins-warn{background:#fffbeb;border-color:#fde68a}
  .ins-info{background:var(--brand-soft);border-color:var(--brand-light)}
  .ins-dot{width:7px;height:7px;border-radius:999px;margin-top:5px;flex:0 0 auto}
  .ins-t{font-size:11.5px;font-weight:700;line-height:1.35;margin:0}
  .ins-a{font-size:10.5px;color:var(--ink-muted);line-height:1.45;margin:2px 0 0}
  .line{display:flex;justify-content:space-between;font-size:11px;padding:3px 0}
  .line.total{border-top:1px solid var(--rule);margin-top:4px;padding-top:6px;font-weight:700}
  .legend{display:flex;gap:14px;margin-top:8px;font-size:10.5px}
  .legend span.k{display:inline-block;width:9px;height:9px;border-radius:999px;margin-right:5px}
  .closing{margin-top:10px;padding-top:7px;border-top:1px solid var(--rule);font-size:8.5px;
           color:var(--ink-subtle);display:flex;justify-content:space-between}

  /* Un rango largo genera muchos días y el documento pasa de una página. Sin
     esto, el salto puede caer en medio de una tarjeta y dejar un titular
     huérfano al pie con sus cifras en la página siguiente. */
  .card,.kpi,.mood,.ins{break-inside:avoid;page-break-inside:avoid}
  .row2,.kpis{break-inside:avoid;page-break-inside:avoid}

  /* El ánimo y la meta. El PDF es lo que el negocio archiva y a veces enseña a
     terceros, así que dice exactamente lo mismo que la pantalla: si el papel
     felicitara donde el panel preocupa, la próxima vez no se creería ninguno. */
  .mood{display:flex;gap:10px;align-items:flex-start;border:1px solid;border-radius:12px;
        padding:10px 13px;margin-bottom:10px}
  .mood-face{flex:0 0 auto;margin-top:1px}
  .mood-t{font-size:13px;font-weight:800;margin:0;line-height:1.3;letter-spacing:-.01em}
  .mood-b{font-size:10.5px;color:var(--ink-muted);line-height:1.45;margin:3px 0 0}
  .mood-celebrating{background:#f0fdf4;border-color:#bbf7d0}
  .mood-good{background:#f7fdf9;border-color:#d5f2e0}
  .mood-steady{background:var(--surface);border-color:var(--border)}
  .mood-soft{background:#fffbeb;border-color:#fde68a}
  .mood-worried{background:var(--brand-soft);border-color:var(--brand-light)}
  .goal-head{display:flex;justify-content:space-between;align-items:baseline;margin-top:7px}
  .goal-n{font-size:19px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  .goal-track{height:8px;border-radius:999px;background:var(--rule);overflow:hidden;margin-top:6px}
  .goal-fill{height:100%;border-radius:999px}
</style></head><body>

${brandBar()}

<div class="titleblock">
  <div>
    <h1>Rendimiento y Retorno</h1>
    <p class="biz">${esc(businessName)}</p>
    <span class="badge">${esc(rangeLabel)}</span>
  </div>
</div>

<div class="mood mood-${mood.level}">
  ${moodFaceSvg(mood.level)}
  <div>
    <p class="mood-t">${esc(mood.headline)}</p>
    <p class="mood-b">${esc(mood.body)}</p>
  </div>
</div>

<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Facturación en comida</div>
    <div class="kpi-value">${soles(data.current.revenue)}</div>
    <div class="kpi-foot">${deltaChip(revDelta, true, 'por noche')}<span class="small muted">${data.current.delivered} ${plural(data.current.delivered, 'pedido', 'pedidos')} en ${data.current.nights} ${plural(data.current.nights, 'noche', 'noches')}</span></div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Ticket promedio</div>
    <div class="kpi-value">${soles(data.current.ticket)}</div>
    <div class="kpi-foot">${deltaChip(ticketDelta)}<span class="small muted">por pedido</span></div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Tu ingreso neto</div>
    <div class="kpi-value" style="color:var(--success-ink)">${soles(netIncome)}</div>
    <div class="kpi-foot"><span class="small muted">Comida menos la comisión</span></div>
  </div>
</div>
<p class="small muted" style="margin:-6px 0 12px">Comparado contra el periodo anterior: ${esc(data.previous.start)} al ${esc(data.previous.end)}.</p>

${
  trendSvg(data.daily)
    ? `<div class="card">
        <h2>Facturación por día</h2>
        <p class="sub">Solo comida, sin el envío</p>
        ${trendSvg(data.daily)}
      </div>`
    : ''
}

${
  goal.state === 'noBaseline'
    ? ''
    : `<div class="card">
  <h2>Tu meta de ${data.period.days} días</h2>
  <p class="sub">Tu propio récord, no el de nadie más</p>
  <div class="goal-head">
    <span class="goal-n">${goal.orders} <span class="small muted" style="font-weight:400">de ${goal.target} ${plural(goal.target, 'pedido', 'pedidos')}</span></span>
    <span class="small muted">${esc(
      goal.missing > 0
        ? `Te faltan ${goal.missing} ${plural(goal.missing, 'pedido', 'pedidos')}`
        : goal.state === 'record'
          ? 'Récord batido'
          : 'Récord igualado',
    )}</span>
  </div>
  <div class="goal-track"><div class="goal-fill" style="width:${Math.max(2, goal.progress * 100)}%;background:${goal.missing > 0 ? 'var(--brand)' : 'var(--success)'}"></div></div>
  <p class="small muted" style="margin:6px 0 0">Tu mejor racha de ${data.period.days} días ${plural(goal.target, 'fue', 'fueron')} ${goal.target} ${plural(goal.target, 'pedido', 'pedidos')}, del ${esc(goal.window?.start ?? '')} al ${esc(goal.window?.end ?? '')}.</p>
  ${
    data.town.businesses >= 3 && data.town.ordersPerNight > 0 && data.current.nights > 0
      ? `<p class="small muted" style="margin:4px 0 0">En San Jacinto el local típico hace ${fmtOrders(data.town.ordersPerNight)} pedidos por noche; tú vas en ${fmtOrders(perNight(data.current.delivered, data.current.nights))}.</p>`
      : ''
  }
</div>`
}

<div class="card">
  <h2>Qué dicen tus números</h2>
  <p class="sub">Lo que cambiaría si fuera tu local</p>
  ${
    insights.length === 0
      ? `<p class="small muted" style="margin-top:8px">Todavía no hay suficiente historial para sacar conclusiones que valgan.</p>`
      : insights
          .map(
            (i) => `<div class="ins ins-${i.tone}">
      <span class="ins-dot" style="background:${i.tone === 'good' ? '#16a34a' : i.tone === 'warn' ? '#f59e0b' : '#f97316'}"></span>
      <div><p class="ins-t">${esc(i.title)}</p><p class="ins-a">${esc(i.action)}</p></div>
    </div>`,
          )
          .join('')
  }
</div>

<div class="row2">
  <div class="card">
    <h2>Tu semana típica</h2>
    <p class="sub">Últimas ${data.weekdayWindow.weeks} semanas, no el rango elegido</p>
    ${weekdaySvg(data.weekday)}
  </div>
  <div class="card">
    <h2>Lo que generó con Tindivo</h2>
    <p class="sub">Los mismos cargos que ves en Mi cuenta</p>
    <div style="font-size:20px;font-weight:800;margin:8px 0 6px;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${soles(data.bill.total)}</div>
    ${
      billRows.length === 0
        ? `<p class="small muted">Sin cargos generados en este rango.</p>`
        : billRows
            .map(
              (r) =>
                `<div class="line"><span class="muted">${esc(r.label)}</span><strong class="mono">${soles(r.value)}</strong></div>`,
            )
            .join('')
    }
  </div>
</div>

<div class="row2">
  <div class="card">
    <h2>Clientes del periodo</h2>
    <p class="sub">Cuántos te conocían ya</p>
    <div style="font-size:20px;font-weight:800;margin:8px 0 4px;letter-spacing:-.02em">${cust.total} ${cust.total === 1 ? 'persona' : 'personas'}</div>
    ${customerSvg(cust)}
    <div class="legend">
      <span><span class="k" style="background:${ACCENT}"></span>Primera vez: <strong>${cust.new}</strong></span>
      <span><span class="k" style="background:${SECOND}"></span>Ya habían pedido: <strong>${cust.returning}</strong> (${tasaRetorno.toFixed(0)}%)</span>
    </div>
  </div>
  <div class="card">
    <h2>Movimiento del periodo</h2>
    <p class="sub">Lo que pasó por tu cocina</p>
    <div style="margin-top:8px">
      <div class="line"><span class="muted">Pedidos entregados</span><strong class="mono">${data.current.delivered}</strong></div>
      <div class="line"><span class="muted">Pedidos cancelados</span><strong class="mono" style="color:${data.current.cancelled > 0 ? 'var(--danger)' : 'var(--ink)'}">${data.current.cancelled}</strong></div>
      <div class="line"><span class="muted">Envíos pagados por tus clientes</span><strong class="mono">${soles(data.current.deliveryFees)}</strong></div>
      <div class="line total"><span>Total que pagaron tus clientes</span><strong class="mono">${soles(data.current.revenue + data.current.deliveryFees)}</strong></div>
    </div>
  </div>
</div>

<div class="closing">
  <span>Generado el ${esc(generatedAt)}</span>
  <span>Documento informativo, no es un comprobante de pago</span>
</div>
</body></html>`
}

/**
 * Pie de página que se repite en TODAS las hojas, con la numeración. Va aparte
 * del documento porque Chromium lo renderiza como un documento independiente:
 * no hereda ni el CSS ni las fuentes de la página, así que la marca y la
 * tipografía hay que volver a declararlas aquí o el pie sale en otra letra.
 */
function footerTemplate(businessName: string, rangeLabel: string): string {
  return `<style>${FONT_FACES}</style>
  <div style="width:100%;padding:0 13mm;font-family:'Geist',system-ui,sans-serif;font-size:7.5px;
              color:#a8a29e;display:flex;justify-content:space-between;align-items:center;
              -webkit-print-color-adjust:exact">
    <span><span style="font-weight:800;color:#f97316">Tindivo</span> &nbsp;·&nbsp; ${esc(businessName)} &nbsp;·&nbsp; ${esc(rangeLabel)}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`
}

/** Renderiza el reporte «Rendimiento» a PDF (A4, retrato). */
export async function renderRendimientoPdf(params: ReportParams): Promise<Buffer> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    // Documento autocontenido (SVG e imágenes en línea, fuentes embebidas en
    // base64, sin CSS ni assets externos): 'load' basta, y es el único
    // wait-until que admite setContent aquí.
    await page.setContent(buildHtml(params), { waitUntil: 'load' })
    // Y aun así hay que esperar a `document.fonts.ready`: las @font-face con
    // `data:` no bloquean el evento `load`, así que sin esto el PDF puede
    // imprimirse con la fuente de reserva y quedar maquetado con otras métricas
    // — un fallo que además NO se reproduce igual dos veces.
    await page.evaluate(() => document.fonts.ready)
    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      displayHeaderFooter: true,
      // Vacío, pero hay que darlo: si no, Chromium imprime su cabecera por
      // defecto con la fecha y la URL en cuanto se activa `displayHeaderFooter`.
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(params.businessName, params.rangeLabel),
      // Los laterales los pone el `padding` del body (así el fondo de las
      // tarjetas puede sangrar si algún día hace falta); arriba y abajo sí son
      // margen de página, y el de abajo es el hueco donde cabe el pie.
      margin: { top: '10mm', right: '0', bottom: '13mm', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
