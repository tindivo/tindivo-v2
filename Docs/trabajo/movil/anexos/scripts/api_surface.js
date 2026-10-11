// Extrae la superficie de la API: ruta, metodos, auth, rpc, tablas, esquemas, patrones.
const fs = require('fs')
const path = require('path')

const ROOT = 'D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app'
const out = []

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name === 'route.ts') out.push(p)
  }
}
walk(ROOT)

const uniq = (a) => [...new Set(a)]
const rows = out.sort().map((file) => {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, path.dirname(file)).replace(/\\/g, '/')
  const route = '/' + rel.replace(/^api\/(v1\/)?/, '').replace(/\[([^\]]+)\]/g, ':$1')
  const methods = uniq([...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)].map((m) => m[1]))
  const roles = uniq([...src.matchAll(/requireRole\(\s*\w+\s*,\s*'(\w+)'/g)].map((m) => m[1]))
  const usesRequireUser = /requireUser\(/.test(src)
  const usesTransition = /handleOrderTransition\(/.test(src)
  const transitionRole = (src.match(/handleOrderTransition\(\s*\w+\s*,\s*'(\w+)'/) || [])[1]
  const rpcs = uniq([...src.matchAll(/\.rpc\(\s*'(\w+)'/g)].map((m) => m[1]))
  const tables = uniq([...src.matchAll(/\.from\(\s*'(\w+)'/g)].map((m) => m[1]))
  const storage = uniq([...src.matchAll(/\.storage\s*\.from\(\s*'([\w-]+)'/g)].map((m) => m[1]))
  const schemas = uniq([...src.matchAll(/\b([A-Z]\w*Schema)\b/g)].map((m) => m[1]))
  const lines = src.split('\n').length
  const flags = []
  if (/withIdempotency|findCompletedReplay/.test(src)) flags.push('idem')
  if (/Ratelimit|ratelimit|rateLimit/.test(src)) flags.push('ratelimit')
  if (/createServiceClient/.test(src)) flags.push('svc')
  if (/createUserClient/.test(src)) flags.push('usr')
  if (/raw\(/.test(src)) flags.push('raw')
  if (/twilio/i.test(src)) flags.push('twilio')
  if (/inngest/i.test(src)) flags.push('inngest')
  if (/corsHeaders/.test(src)) flags.push('cors')
  if (/getRequestId/.test(src)) flags.push('reqid')
  if (/searchParams/.test(src)) flags.push('query')
  if (/limit|cursor|offset|range\(/.test(src)) flags.push('paging?')
  const auth = usesTransition
    ? `role:${transitionRole}`
    : roles.length
      ? 'role:' + roles.join('|')
      : usesRequireUser
        ? 'user'
        : 'public?'
  return { route, methods: methods.join(','), auth, rpcs, tables, storage, schemas, flags, lines }
})

const mode = process.argv[2] || 'table'
if (mode === 'json') {
  console.log(JSON.stringify(rows, null, 1))
} else {
  for (const r of rows) {
    console.log(
      [
        r.route,
        r.methods,
        r.auth,
        'rpc=' + r.rpcs.join('+'),
        'tbl=' + r.tables.join('+'),
        r.storage.length ? 'sto=' + r.storage.join('+') : '',
        'sch=' + r.schemas.slice(0, 4).join('+'),
        r.flags.join(','),
        r.lines + 'L',
      ]
        .filter(Boolean)
        .join(' | '),
    )
  }
  console.log('\nTOTAL rutas:', rows.length)
  const by = (f) => rows.reduce((a, r) => ((a[f(r)] = (a[f(r)] || 0) + 1), a), {})
  console.log('por auth:', JSON.stringify(by((r) => r.auth)))
  console.log('con idempotencia:', rows.filter((r) => r.flags.includes('idem')).length)
  console.log('con ratelimit:', rows.filter((r) => r.flags.includes('ratelimit')).length)
  console.log('usan raw() (sin envoltura):', rows.filter((r) => r.flags.includes('raw')).length)
  console.log('usan cors por ruta:', rows.filter((r) => r.flags.includes('cors')).length)
  console.log('con paginacion/limite:', rows.filter((r) => r.flags.includes('paging?')).length)
  console.log('total lineas:', rows.reduce((s, r) => s + r.lines, 0))
}
