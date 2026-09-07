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
  niceMax,
  type PerformancePayload,
  perNight,
  plural,
  projectSeries,
  stackedPair,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_SHORT,
} from '@tindivo/core'
import { launchBrowser } from './browser'

/**
 * Los MISMOS valores validados que usa el panel
 * (`features/rendimiento/lib/chart-tokens.ts`). Se repiten aquí porque
 * `apps/api` no depende de `apps/negocios` — pero si cambias uno, cambia el
 * otro y vuelve a pasar el validador de paleta.
 */
const ACCENT = '#c2410c'
const SECOND = '#0369a1'
const MUTED = '#d6d3d1'
const GRID = '#eae7e2'

function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

function dayLabel(iso: string): string {
  const p = iso.split('-')
  return `${p[2]}/${p[1]}`
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
  return `<span class="chip ${bueno ? 'chip-good' : 'chip-bad'}">${subio ? '▲' : '▼'} ${fmtPct(delta.pct)}${suf}</span>`
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
  const max = niceMax(Math.max(...values))
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
<html><head><meta charset="utf-8"/><style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0}
  body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1614;width:210mm;padding:10mm 13mm}
  .muted{color:#57534e}
  .small{font-size:11px}
  .mono{font-family:'Courier New',monospace}
  h1{font-size:21px;font-weight:800;margin:0 0 3px}
  h2{font-size:13px;font-weight:800;margin:0}
  .sub{font-size:11px;color:#57534e;margin:0}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #f1f1ef;padding-bottom:8px;margin-bottom:11px}
  .brand{font-size:18px;font-weight:800;color:#f97316}
  .brand-sub{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#a8a29e;margin-top:2px}
  .badge{display:inline-block;margin-top:6px;padding:2px 9px;border-radius:999px;background:#fff7ed;color:#c2410c;font-size:10px;font-weight:700}
  .kpis{display:flex;gap:9px;margin-bottom:10px}
  .kpi{flex:1;border:1px solid #eeece9;border-radius:12px;padding:11px 13px}
  .kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#57534e;font-weight:700}
  .kpi-value{font-size:22px;font-weight:800;margin-top:4px;letter-spacing:-.02em}
  .kpi-foot{margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .chip{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700}
  .chip-good{background:#dcfce7;color:#15803d}
  .chip-bad{background:#fee2e2;color:#b91c1c}
  .chip-flat{background:#faf6f1;color:#57534e}
  .card{border:1px solid #eeece9;border-radius:12px;padding:11px 13px;margin-bottom:9px}
  .row2{display:flex;gap:10px;margin-bottom:9px}
  .row2>.card{flex:1;margin-bottom:0}
  .ins{display:flex;gap:8px;border:1px solid;border-radius:10px;padding:8px 10px;margin-top:7px}
  .ins-good{background:#f0fdf4;border-color:#bbf7d0}
  .ins-warn{background:#fffbeb;border-color:#fde68a}
  .ins-info{background:#fff7ed;border-color:#fed7aa}
  .ins-dot{width:7px;height:7px;border-radius:999px;margin-top:5px;flex:0 0 auto}
  .ins-t{font-size:11.5px;font-weight:700;line-height:1.35;margin:0}
  .ins-a{font-size:10.5px;color:#57534e;line-height:1.45;margin:2px 0 0}
  .line{display:flex;justify-content:space-between;font-size:11px;padding:3px 0}
  .line.total{border-top:1px solid #f1f1ef;margin-top:4px;padding-top:6px;font-weight:700}
  .legend{display:flex;gap:14px;margin-top:8px;font-size:10.5px}
  .legend span.k{display:inline-block;width:9px;height:9px;border-radius:999px;margin-right:5px}
  .foot{margin-top:10px;padding-top:7px;border-top:1px solid #f1f1ef;font-size:8.5px;color:#a8a29e;display:flex;justify-content:space-between}
  /* El ánimo y la meta. El PDF es lo que el negocio archiva y a veces enseña a
     terceros, así que dice exactamente lo mismo que la pantalla: si el papel
     felicitara donde el panel preocupa, la próxima vez no se creería ninguno. */
  .mood{display:flex;gap:10px;align-items:flex-start;border:1px solid;border-radius:12px;padding:10px 13px;margin-bottom:10px}
  .mood-emoji{font-size:26px;line-height:1}
  .mood-t{font-size:13px;font-weight:800;margin:0;line-height:1.3}
  .mood-b{font-size:10.5px;color:#57534e;line-height:1.45;margin:3px 0 0}
  .mood-celebrating{background:#f0fdf4;border-color:#bbf7d0}
  .mood-good{background:#f7fdf9;border-color:#d5f2e0}
  .mood-steady{background:#faf6f1;border-color:#eeece9}
  .mood-soft{background:#fffbeb;border-color:#fde68a}
  .mood-worried{background:#fff7ed;border-color:#fed7aa}
  .goal-head{display:flex;justify-content:space-between;align-items:baseline;margin-top:7px}
  .goal-n{font-size:19px;font-weight:800;letter-spacing:-.02em}
  .goal-track{height:8px;border-radius:999px;background:#f1f1ef;overflow:hidden;margin-top:6px}
  .goal-fill{height:100%;border-radius:999px}
</style></head><body>

<div class="header">
  <div>
    <h1>Rendimiento y Retorno</h1>
    <p class="sub">${esc(businessName)}</p>
    <span class="badge">${esc(rangeLabel)}</span>
  </div>
  <div style="text-align:right">
    <div class="brand">tindivo</div>
    <div class="brand-sub">Reporte de negocio</div>
  </div>
</div>

<div class="mood mood-${mood.level}">
  <span class="mood-emoji">${mood.emoji}</span>
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
    <div class="kpi-value" style="color:#15803d">${soles(netIncome)}</div>
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
  <div class="goal-track"><div class="goal-fill" style="width:${Math.max(2, goal.progress * 100)}%;background:${goal.missing > 0 ? '#f97316' : '#16a34a'}"></div></div>
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
    <div style="font-size:20px;font-weight:800;margin:8px 0 6px">${soles(data.bill.total)}</div>
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
    <div style="font-size:20px;font-weight:800;margin:8px 0 4px">${cust.total} ${cust.total === 1 ? 'persona' : 'personas'}</div>
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
      <div class="line"><span class="muted">Pedidos cancelados</span><strong class="mono" style="color:${data.current.cancelled > 0 ? '#dc2626' : '#1a1614'}">${data.current.cancelled}</strong></div>
      <div class="line"><span class="muted">Envíos pagados por tus clientes</span><strong class="mono">${soles(data.current.deliveryFees)}</strong></div>
      <div class="line total"><span>Total que pagaron tus clientes</span><strong class="mono">${soles(data.current.revenue + data.current.deliveryFees)}</strong></div>
    </div>
  </div>
</div>

<div class="foot">
  <span>Generado el ${esc(generatedAt)} · tindivo.com</span>
  <span>Documento informativo, no es un comprobante de pago</span>
</div>
</body></html>`
}

/** Renderiza el reporte «Rendimiento» a PDF (A4, retrato). */
export async function renderRendimientoPdf(params: ReportParams): Promise<Buffer> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    // Documento autocontenido (SVG en línea, sin CSS ni imágenes externas):
    // 'load' basta, y es el único wait-until que admite setContent aquí.
    await page.setContent(buildHtml(params), { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
