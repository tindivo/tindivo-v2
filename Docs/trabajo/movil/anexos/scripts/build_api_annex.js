// Genera anexos/A-superficie-api.md desde api_surface.json
const fs = require('fs')
const path = require('path')

const SP = 'C:/Users/Jesus/AppData/Local/Temp/claude/D--Tinkuy-Creativo-Proyectos-Tindivo-Code-tindivo-v2/17afe8ed-bda4-497b-8b98-fbd3759bbad8/scratchpad'
const OUT = 'D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/customer_app_migration/anexos/A-superficie-api.md'
const rows = JSON.parse(fs.readFileSync(path.join(SP, 'api_surface.json'), 'utf8'))

const groupOf = (r) => {
  const seg = r.route.split('/')[1] || ''
  if (['admin', 'business', 'customer', 'driver', 'public', 'push'].includes(seg)) return seg
  return 'sistema'
}
const TITLE = {
  customer: 'Cliente (`/customer/*`) — 8 rutas',
  public: 'Públicas (`/public/*`) — sin sesión',
  push: 'Push (`/push/*`) — cualquier usuario autenticado',
  business: 'Negocio (`/business/*`)',
  driver: 'Motorizado (`/driver/*`)',
  admin: 'Admin (`/admin/*`)',
  sistema: 'Sistema (`/health`, `/inngest`)',
}
const ORDER = ['customer', 'public', 'push', 'business', 'driver', 'admin', 'sistema']

const cell = (a) => (a.length ? a.map((x) => `\`${x}\``).join(', ') : '—')
const methods = (m) => m.split(',').filter((x) => x && x !== 'OPTIONS').join(', ') || '—'
const flags = (f) => {
  const keep = f.filter((x) => ['idem', 'usr', 'raw', 'twilio', 'inngest', 'paging?'].includes(x))
  return keep.length ? keep.join(', ') : '—'
}

const groups = {}
for (const r of rows) (groups[groupOf(r)] = groups[groupOf(r)] || []).push(r)

const mut = rows.filter((r) => /POST|PUT|PATCH|DELETE/.test(r.methods) && r.route !== '/inngest')
const idem = mut.filter((r) => r.flags.includes('idem'))

const L = []
L.push('# Anexo A · Superficie de la API (85 rutas)')
L.push('')
L.push('> **Generado por script** leyendo cada `route.ts` de `apps/api/app/api` en `HEAD 09749a4` (2026-09-20). Es la base de')
L.push('> `01-sistema-actual/03-superficie-api.md` y de la propuesta de **superficie móvil** (`ARQ-01`). Las columnas «RPC»,')
L.push('> «Tablas» y «Storage» son lo que el código **de la ruta** llama; no incluyen lo que hacen las RPC por dentro.')
L.push('')
L.push('**Totales:** ' + rows.length + ' rutas · ' + mut.length + ' mutan datos · **' + idem.length + ' con `Idempotency-Key`** · **0 con *rate limiting*** · ' +
  rows.filter((r) => r.flags.includes('raw')).length + ' responde sin envoltura (`raw`) · 41 RPC distintas · 32 tablas tocadas.')
L.push('')
L.push('**Auth:** `role:X` = exige el rol X (consulta `user_roles`) · `user` = cualquier sesión válida · `public?` = sin sesión.')
L.push('**Banderas:** `idem` = idempotencia · `usr` = usa el cliente con el JWT del usuario (el resto usa *service-role*) · `raw` = sin envoltura `{data}` · `twilio` · `inngest` · `paging?` = parece tener límite/paginación (verificar).')
L.push('')
for (const g of ORDER) {
  const list = groups[g] || []
  if (!list.length) continue
  L.push(`## ${TITLE[g]}`)
  L.push('')
  L.push('| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |')
  L.push('|---|---|---|---|---|---|---|')
  for (const r of list) {
    const tbl = [...r.tables, ...r.storage.map((s) => 'storage:' + s)]
    L.push(`| \`${r.route}\` | ${methods(r.methods)} | ${r.auth} | ${cell(r.rpcs)} | ${cell(tbl)} | ${flags(r.flags)} | ${r.lines} |`)
  }
  L.push('')
}
L.push('## Rutas que mutan y **no** usan idempotencia (' + mut.length + ' − ' + idem.length + ' = ' + (mut.length - idem.length) + ')')
L.push('')
L.push('Las cuatro que sí: `' + idem.map((r) => r.route).join('`, `') + '`. Las más relevantes para el móvil (cliente):')
L.push('`POST /customer/orders/:id/cancel`, `POST /customer/orders/:id/prepay-proof`, `POST /customer/orders/:id/appeal`, `POST /customer/phone/send-code`, `POST /customer/phone/verify`, `POST /push/subscriptions` (ver `DAT-01`).')
L.push('')
fs.writeFileSync(OUT, L.join('\n'), 'utf8')
console.log('Escrito', OUT, 'bytes:', fs.statSync(OUT).size)
