#!/usr/bin/env node
/**
 * Guardarraíl del ORDEN de despliegue.
 *
 *   pnpm check:deploy
 *
 * QUÉ PROBLEMA RESUELVE, Y NO ES HIPOTÉTICO.
 *
 * El código de este repo se escribe contra el esquema que va a haber, no contra
 * el que hay: `database.types.ts` se edita a mano al escribir la migración para
 * que el árbol compile antes del push. Eso es correcto y no se toca — pero
 * tiene una consecuencia que muerde: **`pnpm type-check` no puede protegerte
 * del orden de despliegue.** Compila igual contra un prod que todavía no tiene
 * las columnas.
 *
 * Y cuando el orden se invierte, no falla ruidosamente: falla en silencio.
 * Medido el 2026-09-02 contra `tindivo-prod`, con dos casos vivos:
 *
 *   · Los tres `select` de direcciones piden `location_confirmed_at` (0202).
 *     Sin la columna, PostgREST devuelve 400 por TODO el select, y los tres
 *     descartan el error: `addrs` cae a `null` y **todo cliente con direcciones
 *     guardadas ve «Añade tu primera dirección»**.
 *   · El API llama a `create_customer_order` con `p_customer_notes` (0199).
 *     Sin ese parámetro la RPC no existe para PostgREST: 404, y **nadie puede
 *     pedir**.
 *
 * Ninguno de los dos deja un error en pantalla. Por eso hace falta una puerta y
 * no una nota en un documento.
 *
 * QUÉ COMPRUEBA. Que el remoto enlazado tenga aplicadas TODAS las migraciones
 * que hay en el repo. Si falta alguna, falla y dice cuál — y, cuando puede,
 * dice además que el código de este árbol YA la asume, que es lo que convierte
 * un «ya la aplicaré luego» en «esto rompe producción al desplegar».
 *
 * CUÁNDO CORRERLO: antes de desplegar las apps. Después de `supabase db push`
 * tiene que estar en verde; si no lo está, el push no llegó a entrar.
 *
 * NO ESTÁ EN `pnpm lint` a propósito: habla con la red y con el proyecto
 * enlazado, y un chequeo de estilo no debe depender de eso. Es una puerta de
 * despliegue, no de commit.
 *
 * SI NO PUEDE COMPROBAR, FALLA. Un guardarraíl que dice «OK» cuando no ha
 * podido mirar es peor que no tenerlo: da permiso sin haber visto nada.
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `fileURLToPath` y no `new URL(...).pathname`: en Windows ese `pathname` llega
// con el espacio de «Tinkuy Creativo» escapado como %20 y con una barra delante
// de la letra de unidad, así que ninguna ruta construida con él existe.
const RAIZ = fileURLToPath(new URL('..', import.meta.url))

/** La salida del CLI trae líneas de cortesía antes del JSON. */
function extraerJson(salida) {
  for (const linea of salida.split(/\r?\n/).reverse()) {
    const t = linea.trim()
    if (!t.startsWith('{')) continue
    try {
      const j = JSON.parse(t)
      if (Array.isArray(j.migrations)) return j
    } catch {
      // Sigue buscando: puede haber otro JSON antes.
    }
  }
  return null
}

let salida
try {
  /*
    `execSync` con la orden entera, y no `execFileSync`, por dos tropiezos de
    Windows encadenados: el CLI es un shim `.cmd`, que `execFileSync` no
    encuentra por su nombre pelado (ENOENT) y que Node 24 se niega a lanzar sin
    shell aunque se le nombre con extensión (EINVAL, por CVE-2024-27980). La
    tercera vía —`shell: true` con array de argumentos— funciona pero avisa de
    deprecación en cada corrida. La orden es fija y no lleva nada de fuera, así
    que no hay nada que escapar.
  */
  salida = execSync('supabase migration list --linked', {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  })
} catch (err) {
  console.error('\nNo se pudo leer el estado del proyecto enlazado.\n')
  console.error(`  ${err.shortMessage ?? err.message}\n`)
  console.error(
    'Comprueba que hay red y que el proyecto está enlazado (`supabase link`).\n' +
      'Esto NO pasa en verde por no haber podido mirar: un permiso de despliegue\n' +
      'que se da a ciegas es justo lo que este guardarraíl viene a impedir.\n',
  )
  process.exit(1)
}

const json = extraerJson(salida)
if (!json) {
  console.error('\nEl CLI respondió, pero no se encontró el JSON de migraciones en su salida.')
  console.error('Salida recibida:\n')
  console.error(salida.slice(-2000))
  process.exit(1)
}

const pendientes = json.migrations.filter((m) => m.local && !m.remote)
const soloRemotas = json.migrations.filter((m) => m.remote && !m.local)
const enRemoto = json.migrations.filter((m) => m.remote).map((m) => m.remote)
const ultimaRemota = enRemoto.length ? enRemoto[enRemoto.length - 1] : '(ninguna)'

/** Fuera los comentarios: lo que se nombra en prosa no lo estrena nadie. */
function sinComentarios(sql) {
  return sql
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
}

/** Columnas y parámetros que aparecen en un fichero de migración. */
function identificadoresDe(rutaSql) {
  const sql = sinComentarios(readFileSync(rutaSql, 'utf8'))
  const nombres = new Set()
  for (const m of sql.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z0-9_]+)/gi)) {
    nombres.add(m[1])
  }
  for (const m of sql.matchAll(/\b(p_[a-z0-9_]+)\b/g)) nombres.add(m[1])
  return nombres
}

const archivosMigracion = readdirSync(join(RAIZ, 'supabase', 'migrations')).filter((f) =>
  f.endsWith('.sql'),
)
const rutaDe = (version) => {
  const archivo = archivosMigracion.find((f) => f.startsWith(`${version}_`))
  return archivo ? { archivo, ruta: join(RAIZ, 'supabase', 'migrations', archivo) } : null
}

/**
 * Lo que el lote pendiente ESTRENA de verdad.
 *
 * No basta con sacar los identificadores de la migración pendiente: `p_notes`,
 * `p_business_id` y compañía llevan cien migraciones vivos y saldrían marcados
 * en todas. Lo que importa es lo que NO existe todavía en el remoto, así que se
 * resta el vocabulario de todo lo que ya está aplicado. Un guardarraíl que
 * grita de más se deja de leer, y entonces no guarda nada.
 *
 * Es una heurística y solo AÑADE información al fallo: si no encuentra nada, la
 * migración sigue contando como pendiente igual.
 */
const yaEnRemoto = new Set()
for (const m of json.migrations) {
  if (!m.remote) continue
  const r = rutaDe(m.remote)
  if (r) for (const n of identificadoresDe(r.ruta)) yaEnRemoto.add(n)
}

const ficherosApp = globSync('apps/**/*.{ts,tsx}', { cwd: RAIZ })
  .filter((f) => !f.includes('node_modules') && !f.includes('.next'))
  .map((f) => readFileSync(join(RAIZ, f), 'utf8'))
  .join('\n')

if (soloRemotas.length) {
  console.error(
    `\nAviso: ${soloRemotas.length} migración(es) están aplicadas en el remoto y NO en el repo:`,
  )
  for (const m of soloRemotas) console.error(`  ${m.remote}`)
  console.error('Alguien aplicó algo fuera del CLI. Eso deja el esquema irreproducible.\n')
}

if (pendientes.length) {
  console.error(`\nPRODUCCIÓN VA POR DETRÁS DEL REPO. Última aplicada: ${ultimaRemota}.\n`)
  console.error(`${pendientes.length} migración(es) sin aplicar:\n`)
  for (const m of pendientes) {
    const r = rutaDe(m.local)
    const estrenos = r
      ? [...identificadoresDe(r.ruta)].filter((n) => !yaEnRemoto.has(n) && ficherosApp.includes(n))
      : []
    const nota = estrenos.length
      ? `
        ← EL CÓDIGO YA LA ASUME: ${estrenos.join(', ')}`
      : ''
    console.error(`  ${m.local}  ${r?.archivo ?? ''}${nota}`)
  }
  console.error(
    '\nLas marcadas rompen producción si las apps se despliegan antes que la\n' +
      'migración, y lo hacen EN SILENCIO: PostgREST devuelve 400 por un select\n' +
      'con una columna que no existe, o 404 por una RPC con un parámetro que no\n' +
      'existe, y el app los descarta sin pintar nada.\n' +
      '\nEl orden es: `supabase db push` -> `pnpm db:types` -> desplegar las apps.\n',
  )
  process.exit(1)
}

console.log(
  `OK — el remoto tiene aplicadas las ${json.migrations.length} migraciones del repo (última: ${ultimaRemota}).`,
)
