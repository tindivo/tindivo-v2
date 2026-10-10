// Genera matriz-disposicion-movil.md a partir de las tablas de requisitos.
const fs = require('fs')
const path = require('path')

const DIR = 'D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/customer_app_migration/03-requisitos'
const FILES = ['CUS-cliente.md', 'NEG-negocios.md', 'MOT-motorizados.md', 'ADM-admin.md', 'SYS-transversal.md', 'NAT-capacidades-nativas.md']
const APPS = ['CUS', 'NEG', 'MOT', 'ADM', 'SYS', 'NAT']
const APP_LABEL = {
  CUS: 'Clientes (`CUS`)',
  NEG: 'Negocios (`NEG`)',
  MOT: 'Motorizados (`MOT`)',
  ADM: 'Admin (`ADM`)',
  SYS: 'Servidor transversal (`SYS`)',
  NAT: 'Nativo nuevo (`NAT`)',
}
const DISPS = ['IGUAL', 'ADAPTAR', 'SOLO-WEB', 'DIFERIR', 'MUERTO', 'NUEVO']
const PHASES = ['M1', 'M2', 'M3', 'W', '—']
const STATES = ['✅', '🟡', '⚠️', '🗑️', '📝', '➕']

const ROW = /^\|\s*((?:CUS|NEG|MOT|ADM|SYS|NAT)-[A-Z]+-\d+)(\s*★)?\s*\|/
const rows = []

for (const f of FILES) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8')
  for (const line of src.split('\n')) {
    const m = ROW.exec(line)
    if (!m) continue
    const id = m[1]
    const star = Boolean(m[2])
    // Se corta desde el FINAL: las celdas internas pueden contener '|' dentro de comillas invertidas.
    const cells = line.replace(/\s*\|\s*$/, '').split('|')
    const title = (cells[1] || '').trim()
    const last = (cells[cells.length - 1] || '').trim()
    const prev = (cells[cells.length - 2] || '').trim()
    let disp, phase, state
    if (id.startsWith('NAT-')) {
      disp = 'NUEVO'
      phase = last.replace(/\s*\(.*\)\s*$/, '').trim()
      state = '➕'
    } else {
      const parts = last.split('·').map((s) => s.trim())
      disp = parts[0]
      phase = parts[1] || '—'
      state = prev
    }
    const app = id.split('-')[0]
    const area = id.split('-')[1]
    rows.push({ id, star, title, disp, phase, state, app, area })
  }
}

const inc = (o, k) => (o[k] = (o[k] || 0) + 1)
const byAppDisp = {}
const byAppPhase = {}
const byAppState = {}
const byArea = {}
for (const r of rows) {
  byAppDisp[r.app] = byAppDisp[r.app] || {}
  inc(byAppDisp[r.app], r.disp)
  byAppPhase[r.app] = byAppPhase[r.app] || {}
  inc(byAppPhase[r.app], r.phase)
  byAppState[r.app] = byAppState[r.app] || {}
  inc(byAppState[r.app], r.state)
  const key = `${r.app}-${r.area}`
  byArea[key] = byArea[key] || {}
  inc(byArea[key], r.disp)
}

function table(headers, dataRows) {
  const head = `| ${headers.join(' | ')} |`
  const sep = `|${headers.map(() => '---').join('|')}|`
  return [head, sep, ...dataRows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
}

const total = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0)
const sumBy = (map, key) => APPS.reduce((a, app) => a + ((map[app] && map[app][key]) || 0), 0)

const dispRows = APPS.map((a) => [APP_LABEL[a], ...DISPS.map((d) => (byAppDisp[a] && byAppDisp[a][d]) || 0), `**${total(byAppDisp[a])}**`])
dispRows.push(['**Total**', ...DISPS.map((d) => `**${sumBy(byAppDisp, d)}**`), `**${rows.length}**`])

const phaseRows = APPS.map((a) => [APP_LABEL[a], ...PHASES.map((p) => (byAppPhase[a] && byAppPhase[a][p]) || 0), `**${total(byAppPhase[a])}**`])
phaseRows.push(['**Total**', ...PHASES.map((p) => `**${sumBy(byAppPhase, p)}**`), `**${rows.length}**`])

const stateRows = APPS.map((a) => [APP_LABEL[a], ...STATES.map((s) => (byAppState[a] && byAppState[a][s]) || 0), `**${total(byAppState[a])}**`])
stateRows.push(['**Total**', ...STATES.map((s) => `**${sumBy(byAppState, s)}**`), `**${rows.length}**`])

const cusAreas = [...new Set(rows.filter((r) => r.app === 'CUS').map((r) => r.area))]
const areaRows = cusAreas.map((ar) => {
  const o = byArea[`CUS-${ar}`] || {}
  return [`\`CUS-${ar}\``, ...DISPS.map((d) => o[d] || 0), `**${total(o)}**`]
})

const short = (s, n = 118) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const cusRows = rows.filter((r) => r.app === 'CUS')

const noMigrar = rows.filter((r) => (r.disp === 'SOLO-WEB' || r.disp === 'MUERTO') && r.app === 'CUS')
const nuevos = rows.filter((r) => r.disp === 'NUEVO' && (r.app === 'CUS' || r.app === 'SYS'))
const conDefecto = rows.filter((r) => r.state === '⚠️')
const estrellas = rows.filter((r) => r.star)
const criticosCus = estrellas.filter((r) => r.app === 'CUS')

const lines = []
lines.push('# Matriz de disposición móvil')
lines.push('')
lines.push('> **Generada por script** a partir de las tablas de `CUS-cliente.md`, `NEG-negocios.md`, `MOT-motorizados.md`,')
lines.push('> `ADM-admin.md`, `SYS-transversal.md` y `NAT-capacidades-nativas.md` (2026-09-20). No se edita a mano: si cambia un')
lines.push('> requisito, se regenera. Leyenda de disposiciones, fases y estados: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).')
lines.push('')
lines.push(`**${rows.length} requisitos y capacidades catalogados**, de los cuales **${estrellas.length} son ★ críticos de paridad** (${criticosCus.length} en el Customer).`)
lines.push('')
lines.push('## 1. Qué se hace con cada cosa (disposición)')
lines.push('')
lines.push(table(['App', ...DISPS, 'Total'], dispRows))
lines.push('')
lines.push('- **IGUAL:** se replica tal cual (dominio del negocio).')
lines.push('- **ADAPTAR:** se replica con la capacidad nativa equivalente (push, GPS, mapa, sesión, cámara).')
lines.push('- **SOLO-WEB:** no existe en la app; se queda en la web o se descarta con la PWA.')
lines.push('- **DIFERIR:** se replica después del primer lanzamiento.')
lines.push('- **MUERTO:** código vestigial; no se migra.')
lines.push('- **NUEVO:** capacidad que no existe hoy.')
lines.push('')
lines.push('## 2. Cuándo (fase)')
lines.push('')
lines.push(table(['App', ...PHASES, 'Total'], phaseRows))
lines.push('')
lines.push('**M1** = clientes, primer lanzamiento · **M2** = clientes tras el lanzamiento · **M3** = otras apps · **W** = se queda en web.')
lines.push('')
lines.push('## 3. En qué estado está hoy (real, verificado en código)')
lines.push('')
lines.push(table(['App', ...STATES, 'Total'], stateRows))
lines.push('')
lines.push('✅ implementado · 🟡 parcial · ⚠️ con defecto conocido · 🗑️ muerto · 📝 solo en documentación · ➕ nuevo.')
lines.push('')
lines.push('## 4. El Customer por área')
lines.push('')
lines.push(table(['Área', ...DISPS, 'Total'], areaRows))
lines.push('')
lines.push('## 5. Lo que **no** va al móvil (Customer): «solo web» y «muerto»')
lines.push('')
lines.push('Es la respuesta a *«hay muchas cosas que se usan en web y que no se usarán en el móvil»*.')
lines.push('')
lines.push(table(['ID', 'Qué es', 'Disposición'], noMigrar.map((r) => [`\`${r.id}\``, short(r.title), r.disp === 'MUERTO' ? '🗑️ MUERTO' : 'SOLO-WEB'])))
lines.push('')
lines.push('## 6. Lo que es **nuevo** (Customer y servidor)')
lines.push('')
lines.push(table(['ID', 'Qué es', 'Fase'], nuevos.map((r) => [`\`${r.id}\``, short(r.title), r.phase])))
lines.push('')
lines.push('Las capacidades nativas nuevas (`NAT-*`, con su justificación) están en [`NAT-capacidades-nativas.md`](NAT-capacidades-nativas.md).')
lines.push('')
lines.push('## 7. Lo que tiene **defecto conocido** y no debe copiarse tal cual (⚠️)')
lines.push('')
lines.push(table(['ID', 'Qué es', 'Móvil'], conDefecto.map((r) => [`\`${r.id}\``, short(r.title), `${r.disp} · ${r.phase}`])))
lines.push('')
lines.push('## 8. Requisitos ★ de paridad del Customer')
lines.push('')
lines.push('iOS y Android deben decidir o cobrar exactamente igual. Cada uno lleva criterios de aceptación en `CUS-cliente.md` y')
lines.push('debe tener **vectores de conformidad** compartidos (`ARQ-03`).')
lines.push('')
lines.push(table(['ID', 'Qué es', 'Móvil'], criticosCus.map((r) => [`\`${r.id}\``, short(r.title), `${r.disp} · ${r.phase}`])))
lines.push('')

const OUT = path.join(DIR, 'matriz-disposicion-movil.md')
fs.writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log('Escrito', OUT)
console.log('Total filas:', rows.length)
console.log('Por app:', JSON.stringify(APPS.reduce((a, k) => ((a[k] = rows.filter((r) => r.app === k).length), a), {})))
console.log('Por disposicion:', JSON.stringify(DISPS.reduce((a, k) => ((a[k] = rows.filter((r) => r.disp === k).length), a), {})))
const desconocidas = rows.filter((r) => !DISPS.includes(r.disp) || !PHASES.includes(r.phase))
console.log('Filas con disposicion/fase no reconocida:', desconocidas.length)
for (const r of desconocidas.slice(0, 10)) console.log('  ', r.id, '|', r.disp, '|', r.phase)
