#!/usr/bin/env node
/**
 * Validador e índice de Docs/producto/ (la zona de canon donde vive la especificación de producto).
 *
 *   node scripts/spec.mjs validar [<capacidad>] [--aviso]   (pnpm spec:validar)
 *   node scripts/spec.mjs indice [--check]                  (pnpm spec:indice)
 *   node scripts/spec.mjs traza <capacidad> [--json]        (pnpm spec:traza; solo stdout, no escribe nada)
 *
 * Una capacidad es Docs/producto/<id>/capacidad.md; sus pantallas, Docs/producto/<id>/pantallas/*.md. Se ignoran
 * Docs/producto/_plantilla/ y Docs/producto/README.md (este último lo genera `indice`).
 *
 * La cabecera (entre ---) es un subconjunto de YAML que se parsea a mano: `clave: valor`, `clave: [a, b]`,
 * `clave: true|false` y, solo para `codigo:`, un nivel de dos espacios (`  web: [..]`). Cualquier otra forma es
 * «cabecera no válida». Si un día hace falta más YAML, se cambia este parser; no se generaliza antes.
 *
 * Sin rangos de IDs: un requisito se nombra completo (CUS-ADR-001). El defecto de `spec-matriz.mjs` nació de un regex
 * de rangos armado con una plantilla literal que perdía `\d`; aquí no hay rangos que perder.
 *
 * Funciona sobre `process.cwd()` (la raíz del repo) para poder probarse en un repo temporal.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const ROOT = process.cwd()
const PRODUCTO = 'Docs/producto'
const ACTORES = ['CUS', 'NEG', 'MOT', 'ADM']
const RE_ID_CAP = /^[a-z][a-z0-9-]*$/
const RE_REQ = /^(CUS|NEG|MOT|ADM|NAT|SYS)-[A-Z]{3}-\d{3}$/
const RE_CA = /^CA-[A-Z]{3}-(\d{2}|P\d+)$/
const PLATAFORMAS_CAP = ['web', 'android', 'ios', 'backend']
const PLATAFORMAS_PANT = ['web', 'android', 'ios']
const CLAVES_CAP = ['id', 'nombre', 'actores', 'lineas', 'depende_de', 'dinero', 'codigo', 'operaciones', 'reglas']
const LISTAS_CAP = ['actores', 'lineas', 'depende_de', 'operaciones', 'reglas']
const CLAVES_PANT = ['canvas', 'requisitos', 'operaciones', 'textos', 'tokens', 'codigo']
const LISTAS_PANT = ['canvas', 'requisitos', 'operaciones', 'textos', 'tokens']
const RE_CITA_LINEA = /\b[\w./-]+\.(ts|tsx|mjs|js|kt|kts|swift|sql|md|json|xml):\d+/
const RE_MARCADOR = /(✅|🟡|⚠|⬜|📝)/u

// ───────────────────────── utilidades

const git = (...args) =>
  execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: ROOT, encoding: 'utf8' })

const rutaAbs = (rel) => join(ROOT, rel)

/** Primer tramo de `rel` (de la raíz hacia el archivo) que es un enlace simbólico o junction; null si ninguno. */
function tramoEnlace(rel) {
  const partes = rel.split('/')
  for (let i = 1; i <= partes.length; i++) {
    const tramo = partes.slice(0, i).join('/')
    try {
      if (lstatSync(rutaAbs(tramo)).isSymbolicLink()) return tramo
    } catch {
      return null // no existe: lo dirá quien lo lea
    }
  }
  return null
}

class ErrorEnlace extends Error {}

/*
  Todo acceso al disco pasa por estas cuatro funciones (Codex, PR #187, CAX-001): antes de tocar `rel` comprueban que
  ni él ni ninguna carpeta de su camino es un enlace simbólico o junction, y si lo es lanzan ErrorEnlace sin haber
  leído, consultado ni enumerado nada a través del enlace.
*/
function sinEnlace(rel, accion) {
  const enlace = tramoEnlace(rel)
  if (enlace) throw new ErrorEnlace(`${enlace} es un enlace simbólico: no se ${accion} ${rel} a través de él`)
}

/** Lee un archivo del repo. */
const leer = (rel) => {
  sinEnlace(rel, 'lee')
  return readFileSync(rutaAbs(rel), 'utf8').replace(/\r\n/g, '\n')
}

/** ¿Existe `rel` en el repo? */
const existe = (rel) => {
  sinEnlace(rel, 'consulta')
  return existsSync(rutaAbs(rel))
}

/** ¿Es `rel` un archivo normal del repo? */
const esArchivo = (rel) => existe(rel) && statSync(rutaAbs(rel)).isFile()

/** Entradas de la carpeta `rel`. Un enlace DENTRO de ella también se rechaza: no se sigue ni se omite en silencio. */
const listar = (rel) => {
  sinEnlace(rel, 'enumera')
  const entradas = readdirSync(rutaAbs(rel), { withFileTypes: true })
  const enlace = entradas.find((e) => e.isSymbolicLink())
  if (enlace) throw new ErrorEnlace(`${rel}/${enlace.name} es un enlace simbólico: no se enumera a través de él`)
  return entradas
}

/** Quita los comentarios HTML conservando los saltos de línea (los números de línea no se mueven). */
const sinComentarios = (texto) => texto.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))

/** Parte una lista en línea por comas, sin partir lo que está entre llaves (`{a,b}`). */
function partirLista(interior) {
  const items = []
  let prof = 0
  let actual = ''
  for (const c of interior) {
    if (c === '{') prof++
    if (c === '}') prof--
    if (c === ',' && prof === 0) {
      items.push(actual)
      actual = ''
    } else actual += c
  }
  items.push(actual)
  return items
}

const sinComillas = (s) => s.replace(/^(['"])(.*)\1$/, '$2')

/** Valor de la cabecera: lista en línea, booleano o cadena. Devuelve null si la forma no es válida. */
function parseValor(v) {
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) return null
    const interior = v.slice(1, -1).trim()
    if (interior === '') return { tipo: 'lista', valor: [] }
    const items = partirLista(interior).map((x) => sinComillas(x.trim()))
    if (items.some((x) => x === '')) return null
    return { tipo: 'lista', valor: items }
  }
  if (v === 'true' || v === 'false') return { tipo: 'bool', valor: v === 'true' }
  if (v === '') return null
  return { tipo: 'texto', valor: sinComillas(v) }
}

/**
 * Parsea la cabecera. Devuelve { cab, fin, errs }: `cab` con las claves y `_linea` (clave → n.º de línea),
 * `fin` el índice de la línea de cierre (---) y `errs` [{ linea, msg }].
 */
function parseCabecera(lineas) {
  const errs = []
  if (lineas[0]?.trim() !== '---')
    return { cab: null, fin: 0, errs: [{ linea: 1, msg: 'cabecera no válida: el archivo debe empezar con ---' }] }
  const fin = lineas.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (fin < 0) return { cab: null, fin: 0, errs: [{ linea: 1, msg: 'cabecera no válida: falta el --- de cierre' }] }

  const cab = { _linea: {} }
  let anidado = false
  for (let i = 1; i < fin; i++) {
    const raw = lineas[i]
    const n = i + 1
    if (raw.trim() === '') continue
    const malo = (por) => errs.push({ linea: n, msg: `cabecera no válida: ${por}: «${raw.trim()}»` })

    const nest = /^ {2}([a-z]+):[ \t]*(.*)$/.exec(raw)
    if (nest && anidado) {
      const [, clave, v] = nest
      if (!PLATAFORMAS_CAP.includes(clave)) {
        malo(`clave anidada desconocida en codigo (${PLATAFORMAS_CAP.join(', ')})`)
        continue
      }
      if (clave in cab.codigo) {
        malo('clave repetida')
        continue
      }
      const val = parseValor(v.trim())
      if (!val || val.tipo !== 'lista') {
        malo('se esperaba una lista en línea [a, b]')
        continue
      }
      cab.codigo[clave] = val.valor
      continue
    }

    const top = /^([a-z_]+):[ \t]*(.*)$/.exec(raw)
    if (!top) {
      malo('forma no admitida')
      continue
    }
    const [, clave, v] = top
    anidado = false
    if (clave in cab) {
      malo('clave repetida')
      continue
    }
    cab._linea[clave] = n
    if (clave === 'codigo' && v.trim() === '') {
      cab.codigo = {}
      anidado = true
      continue
    }
    const val = parseValor(v.trim())
    if (!val) {
      malo('valor no admitido (lista [a, b], true/false o texto)')
      continue
    }
    cab[clave] = val.valor
    cab._linea[`${clave}:tipo`] = val.tipo
  }
  return { cab, fin, errs }
}

/** Globs a regex: `**` cruza carpetas, `*` no cruza `/`, `?` es un carácter. Sin llaves ni clases. */
function globARegex(glob) {
  const g = glob.replace(/^\.\//, '')
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++
        if (g[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

// ───────────────────────── carga

/** Recorre el disco bajo `dir` y devuelve los .md (rutas relativas con /). */
function mdBajo(dir) {
  const out = []
  if (!existe(dir)) return out
  for (const e of listar(dir)) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) out.push(...mdBajo(rel))
    else if (e.name.endsWith('.md')) out.push(rel)
  }
  return out.sort()
}

function seccionesDe(lineasCuerpo, desde) {
  const secciones = {}
  let actual = null
  lineasCuerpo.forEach((texto, k) => {
    const n = desde + k + 1
    const h = /^##\s+(.*?)\s*$/.exec(texto)
    if (h) {
      actual = h[1]
      secciones[actual] = []
    } else if (actual) secciones[actual].push({ n, texto })
  })
  return secciones
}

function filasDeTabla(seccion = []) {
  const filas = []
  for (const { n, texto } of seccion) {
    const t = texto.trim()
    if (!t.startsWith('|')) continue
    const celdas = t
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())
    if (celdas.every((c) => /^:?-+:?$/.test(c))) continue
    if (/^(ID|CA)$/i.test(celdas[0])) continue
    filas.push({ n, celdas })
  }
  return filas
}

/** Lee todo Docs/producto/ y devuelve { caps (Map), errores [{caps, msg}] } con los errores de forma. */
function cargar() {
  const errores = []
  const caps = new Map()
  const err = (capsAfectadas, msg) => errores.push({ caps: capsAfectadas, msg })

  const carpetas = existe(PRODUCTO)
    ? listar(PRODUCTO)
        .filter((e) => e.isDirectory() && e.name !== '_plantilla')
        .map((e) => e.name)
        .sort()
    : []

  for (const carpeta of carpetas) {
    const file = `${PRODUCTO}/${carpeta}/capacidad.md`
    if (!existe(file)) {
      err([carpeta], `${PRODUCTO}/${carpeta} · falta capacidad.md`)
      continue
    }
    const lineas = leer(file).split('\n')
    const { cab, fin, errs } = parseCabecera(lineas)
    for (const e of errs) err([carpeta], `${file}:${e.linea} · ${e.msg}`)
    const cuerpo = sinComentarios(lineas.slice(fin + 1).join('\n')).split('\n')
    const cap = {
      carpeta,
      file,
      cab,
      secciones: seccionesDe(cuerpo, fin + 1),
      requisitos: [],
      criterios: [],
      pantallas: [],
    }
    caps.set(carpeta, cap)

    const dirPant = `${PRODUCTO}/${carpeta}/pantallas`
    for (const pf of mdBajo(dirPant).filter((f) => f.split('/').length === 5)) {
      const slug = pf.split('/').pop().replace(/\.md$/, '')
      const pl = leer(pf).split('\n')
      const r = parseCabecera(pl)
      for (const e of r.errs) err([carpeta], `${pf}:${e.linea} · ${e.msg}`)
      cap.pantallas.push({ file: pf, clave: `${carpeta}/${slug}`, cab: r.cab })
    }
  }
  return { caps, errores }
}

// ───────────────────────── validar

function validarCabeceraTipos(file, cab, claves, listas, errAt) {
  for (const k of claves) {
    if (!(k in cab)) errAt(file, null, `falta la clave obligatoria «${k}» en la cabecera`)
  }
  for (const k of listas) {
    if (k in cab && cab._linea[`${k}:tipo`] !== 'lista')
      errAt(file, cab._linea[k], `cabecera no válida: «${k}» debe ser una lista [a, b]`)
  }
  if ('codigo' in cab && (typeof cab.codigo !== 'object' || Array.isArray(cab.codigo)))
    errAt(file, cab._linea.codigo, 'cabecera no válida: «codigo» debe llevar web/android/ios anidados')
}

const globsDe = (cab) =>
  cab && cab.codigo && typeof cab.codigo === 'object' && !Array.isArray(cab.codigo)
    ? Object.values(cab.codigo).flat()
    : []

function validar({ objetivo }) {
  const { caps, errores } = cargar()
  const errs = errores
  const err = (capsAfectadas, msg) => errs.push({ caps: capsAfectadas, msg })
  const donde = (file, linea) => (linea ? `${file}:${linea}` : file)

  const tracked = git('ls-files', '-z').split('\0').filter(Boolean)
  let operationIds = null
  const operacionesDefinidas = () => {
    if (operationIds) return operationIds
    operationIds = new Set()
    const f = 'packages/contracts/openapi/v1.json'
    if (!existe(f)) return operationIds
    const spec = JSON.parse(leer(f))
    for (const item of Object.values(spec.paths ?? {}))
      for (const op of Object.values(item)) if (op && typeof op === 'object' && op.operationId) operationIds.add(op.operationId)
    return operationIds
  }
  let migraciones = null
  const textoMigraciones = () => {
    migraciones ??= tracked
      .filter((f) => f.startsWith('supabase/migrations/') && f.endsWith('.sql'))
      .map((f) => leer(f))
      .join('\n')
    return migraciones
  }
  let contratos = null
  const textoContratos = () => {
    contratos ??= tracked
      .filter((f) => f.startsWith('packages/contracts/src/') && f.endsWith('.ts'))
      .map((f) => leer(f))
      .join('\n')
    return contratos
  }

  // 1 · cabeceras y 2 · IDs definidos
  const reqDef = new Map() // id → { donde, cap }
  const caDef = new Map()
  const refsCriterios = []

  const defineId = (mapa, id, file, linea, cap) => {
    const aqui = donde(file, linea)
    const previo = mapa.get(id)
    if (previo) err([cap, previo.cap], `${aqui} · «${id}» ya está definido en ${previo.donde}`)
    else mapa.set(id, { donde: aqui, cap })
  }

  for (const cap of caps.values()) {
    const { carpeta, file, cab } = cap
    const errAt = (f, linea, msg) => err([carpeta], `${donde(f, linea)} · ${msg}`)
    if (cab) {
      validarCabeceraTipos(file, cab, CLAVES_CAP, LISTAS_CAP, errAt)
      if (typeof cab.id === 'string') {
        if (!RE_ID_CAP.test(cab.id)) errAt(file, cab._linea.id, `id «${cab.id}» no cumple ^[a-z][a-z0-9-]*$`)
        if (cab.id !== carpeta) errAt(file, cab._linea.id, `id «${cab.id}» distinto de la carpeta «${carpeta}»`)
      }
      if ('dinero' in cab && cab._linea['dinero:tipo'] !== 'bool')
        errAt(file, cab._linea.dinero, 'cabecera no válida: «dinero» debe ser true o false')
      if (Array.isArray(cab.actores))
        for (const a of cab.actores)
          if (!ACTORES.includes(a)) errAt(file, cab._linea.actores, `actor «${a}» fuera de ${ACTORES.join(', ')}`)
    }
    for (const { n, celdas } of filasDeTabla(cap.secciones.Requisitos)) {
      const id = celdas[0]
      if (!RE_REQ.test(id)) {
        errAt(file, n, `ID de requisito no válido: «${id}» (forma CUS-ABC-001)`)
        continue
      }
      cap.requisitos.push(id)
      defineId(reqDef, id, file, n, carpeta)
    }
    for (const { n, celdas } of filasDeTabla(cap.secciones['Criterios de aceptación'])) {
      const id = celdas[0]
      if (!RE_CA.test(id)) {
        errAt(file, n, `ID de criterio no válido: «${id}» (forma CA-ABC-01 o CA-ABC-P1)`)
        continue
      }
      cap.criterios.push(id)
      defineId(caDef, id, file, n, carpeta)
      for (const r of (celdas[2] ?? '').split(/[,·]/).map((x) => x.trim()).filter(Boolean))
        refsCriterios.push({ id: r, file, n, cap: carpeta })
    }
    for (const p of cap.pantallas) {
      if (p.cab) validarCabeceraTipos(p.file, p.cab, CLAVES_PANT, LISTAS_PANT, (f, l, m) => err([carpeta], `${donde(f, l)} · ${m}`))
    }
  }

  // 3 y 4 · requisitos referenciados completos y definidos
  const verificaReq = (id, file, linea, cap) => {
    if (!RE_REQ.test(id)) err([cap], `${donde(file, linea)} · ID incompleto: «${id}» (se nombra completo, sin rangos ni abreviaturas)`)
    else if (!reqDef.has(id)) err([cap], `${donde(file, linea)} · el requisito «${id}» no está definido en ninguna capacidad`)
  }
  for (const cap of caps.values())
    for (const p of cap.pantallas)
      if (p.cab && Array.isArray(p.cab.requisitos))
        for (const id of p.cab.requisitos) verificaReq(id, p.file, p.cab._linea.requisitos, cap.carpeta)
  for (const r of refsCriterios) verificaReq(r.id, r.file, r.n, r.cap)

  // 5 · depende_de: existe y sin ciclos
  const grafo = new Map()
  for (const cap of caps.values()) {
    const deps = Array.isArray(cap.cab?.depende_de) ? cap.cab.depende_de : []
    grafo.set(cap.carpeta, deps)
    for (const d of deps)
      if (!caps.has(d)) err([cap.carpeta], `${donde(cap.file, cap.cab._linea.depende_de)} · depende_de «${d}»: no existe esa capacidad`)
  }
  const estado = new Map()
  const camino = []
  const visita = (id) => {
    estado.set(id, 1)
    camino.push(id)
    for (const d of grafo.get(id) ?? []) {
      if (!grafo.has(d)) continue
      if (estado.get(d) === 1) {
        const ciclo = [...camino.slice(camino.indexOf(d)), d]
        err(ciclo.slice(0, -1), `${PRODUCTO} · ciclo de dependencias: ${ciclo.join(' → ')}`)
      } else if (!estado.get(d)) visita(d)
    }
    camino.pop()
    estado.set(id, 2)
  }
  for (const id of grafo.keys()) if (!estado.get(id)) visita(id)

  // 6 · operaciones, 7 · codigo, 8 · reglas
  const verificaOps = (file, cab, cap) => {
    if (!cab || !Array.isArray(cab.operaciones)) return
    for (const op of cab.operaciones)
      if (!operacionesDefinidas().has(op))
        err([cap], `${donde(file, cab._linea.operaciones)} · operationId «${op}» no existe en packages/contracts/openapi/v1.json`)
  }
  const verificaGlobs = (file, cab, cap) => {
    for (const g of globsDe(cab)) {
      const re = globARegex(g)
      if (!tracked.some((f) => re.test(f))) err([cap], `${donde(file, cab._linea.codigo)} · el glob no encuentra archivos: ${g}`)
    }
  }
  for (const cap of caps.values()) {
    verificaOps(cap.file, cap.cab, cap.carpeta)
    verificaGlobs(cap.file, cap.cab, cap.carpeta)
    for (const p of cap.pantallas) {
      verificaOps(p.file, p.cab, cap.carpeta)
      verificaGlobs(p.file, p.cab, cap.carpeta)
    }
    if (Array.isArray(cap.cab?.reglas)) {
      for (const r of cap.cab.reglas) {
        const aqui = donde(cap.file, cap.cab._linea.reglas)
        if (r.startsWith('app_settings:')) {
          const clave = r.slice('app_settings:'.length)
          if (!/^[a-z0-9_]+$/.test(clave) || !textoMigraciones().includes(`'${clave}'`))
            err([cap.carpeta], `${aqui} · regla «${r}»: la clave no aparece entre comillas simples en supabase/migrations/`)
        } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(r) || !new RegExp(`export\\s+(?:const|function)\\s+${r}\\b`).test(textoContratos()))
          err([cap.carpeta], `${aqui} · regla «${r}»: no es app_settings:<clave> ni un símbolo exportado de packages/contracts/src`)
      }
    }

    // 9 · la sección Reglas solo cita
    const reglas = Array.isArray(cap.cab?.reglas) ? cap.cab.reglas : []
    for (const { n, texto } of cap.secciones.Reglas ?? []) {
      if (texto.trim() === '') continue
      const aqui = donde(cap.file, n)
      const cita = 'la sección Reglas solo cita; el valor vive en su casa'
      if (!/^-\s+\S/.test(texto)) {
        err([cap.carpeta], `${aqui} · ${cita} (cada línea es un ítem «- …»)`)
        continue
      }
      const porSimbolo = [...texto.matchAll(/`([^`]+)`/g)].some((m) => reglas.includes(m[1]))
      const porEnlace = [...texto.matchAll(/\]\(([^)\s]+)\)/g)].some((m) => {
        const ruta = normalize(join(dirname(cap.file), m[1].split('#')[0])).replaceAll('\\', '/')
        return ruta.startsWith('Docs/negocio/') && existe(ruta)
      })
      if (!porSimbolo && !porEnlace) err([cap.carpeta], `${aqui} · ${cita} (ninguna referencia resuelve)`)
      const resto = texto.replace(/`[^`]*`/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '')
      if (/\d/.test(resto)) err([cap.carpeta], `${aqui} · ${cita} (hay un número escrito a mano)`)
    }

    // 10 · Antes de tocar ≤ 15 líneas
    const antes = (cap.secciones['Antes de tocar'] ?? []).filter((l) => l.texto.trim() !== '')
    if (antes.length > 15)
      err([cap.carpeta], `${cap.file}:${antes[15].n} · «Antes de tocar» tiene ${antes.length} líneas; el máximo es 15`)
  }

  // 11 · citas por línea y marcadores de estado manual, en todo Docs/producto/**/*.md
  for (const f of mdBajo(PRODUCTO)) {
    if (f.startsWith(`${PRODUCTO}/_plantilla/`) || f === `${PRODUCTO}/README.md`) continue
    const carpeta = f.split('/')[2]
    sinComentarios(leer(f))
      .split('\n')
      .forEach((linea, i) => {
        const cita = RE_CITA_LINEA.exec(linea)
        if (cita) err([carpeta], `${f}:${i + 1} · cita por línea prohibida («${cita[0]}»): cita el símbolo, no la línea`)
        const marca = RE_MARCADOR.exec(linea)
        if (marca) err([carpeta], `${f}:${i + 1} · marcador de estado manual prohibido («${marca[0]}»): el estado lo calcula spec:traza`)
      })
  }

  // 12 · alcance
  const lista = objetivo ? [...caps.values()].filter((c) => c.carpeta === objetivo) : [...caps.values()]
  if (objetivo && lista.length === 0) return { errores: [`la capacidad «${objetivo}» no existe en ${PRODUCTO}/`], conteo: null }
  const visibles = objetivo ? errs.filter((e) => e.caps.includes(objetivo)) : errs
  return {
    errores: [...new Set(visibles.map((e) => e.msg))],
    conteo: {
      cap: lista.length,
      pant: lista.reduce((a, c) => a + c.pantallas.length, 0),
      req: lista.reduce((a, c) => a + c.requisitos.length, 0),
      ca: lista.reduce((a, c) => a + c.criterios.length, 0),
    },
  }
}

// ───────────────────────── índice

function generarIndice() {
  const { caps, errores } = cargar()
  if (errores.length) return { errores: errores.map((e) => e.msg) }
  const lista = [...caps.values()]
    .filter((c) => c.cab)
    .sort((a, b) => (a.carpeta < b.carpeta ? -1 : 1))

  const out = [
    '# Producto — índice de capacidades',
    '',
    '> Verificado: generado por pnpm spec:indice',
    '',
    '> **Este archivo lo genera `pnpm spec:indice` y no se edita a mano.** La verdad de cada capacidad vive en',
    '> `Docs/producto/<id>/capacidad.md` y en sus fichas de `pantallas/`; el CI falla si este índice no está al día.',
    '',
  ]
  if (lista.length === 0) {
    out.push('Todavía no hay capacidades migradas.', '')
    return { errores: [], texto: out.join('\n') }
  }
  const arr = (x) => (Array.isArray(x) && x.length ? x.join(', ') : '—')
  // requisitos y criterios se cuentan con la misma lectura que `validar`
  for (const c of lista) {
    for (const { celdas } of filasDeTabla(c.secciones.Requisitos)) if (RE_REQ.test(celdas[0])) c.requisitos.push(celdas[0])
    for (const { celdas } of filasDeTabla(c.secciones['Criterios de aceptación'])) if (RE_CA.test(celdas[0])) c.criterios.push(celdas[0])
  }
  out.push(
    '## Capacidades',
    '',
    '| Capacidad | Nombre | Actores | Líneas | Depende de | Dinero | Pantallas | Requisitos | Criterios |',
    '|---|---|---|---|---|---|---|---|---|',
  )
  for (const c of lista)
    out.push(
      `| [${c.carpeta}](${c.carpeta}/capacidad.md) | ${c.cab.nombre ?? '—'} | ${arr(c.cab.actores)} | ${arr(c.cab.lineas)} | ${arr(c.cab.depende_de)} | ${c.cab.dinero === true ? 'sí' : 'no'} | ${c.pantallas.length} | ${c.requisitos.length} | ${c.criterios.length} |`,
    )
  const lineas = [...new Set(lista.flatMap((c) => (Array.isArray(c.cab.lineas) ? c.cab.lineas : [])))].sort()
  out.push('', '## Capacidades por línea de negocio', '')
  if (lineas.length === 0) out.push('Ninguna capacidad declara líneas todavía.', '')
  else {
    out.push(`| Línea | ${lista.map((c) => c.carpeta).join(' | ')} |`, `|---|${lista.map(() => '---').join('|')}|`)
    for (const l of lineas)
      out.push(`| ${l} | ${lista.map((c) => (Array.isArray(c.cab.lineas) && c.cab.lineas.includes(l) ? '●' : '')).join(' | ')} |`)
    out.push('')
  }
  return { errores: [], texto: out.join('\n') }
}

// ───────────────────────── traza

const PLATAFORMAS_TRAZA = ['web', 'android', 'ios', 'backend']
const RE_ARCHIVO_TEST = /\.(test|spec)\.|(^|\/)(src\/test|__tests__|e2e)\//
const RE_ID_PLANO = /^[A-Za-z0-9-]+$/

/** Plataforma de un archivo de test por su ruta (packages cuenta como web); null si no es de ninguna. */
function plataformaDe(ruta) {
  if (ruta.startsWith('apps/android/')) return 'android'
  if (ruta.startsWith('apps/ios/')) return 'ios'
  if (ruta.startsWith('apps/api/')) return 'backend'
  if (ruta.startsWith('apps/customer/') || ruta.startsWith('packages/')) return 'web'
  return null
}

/**
 * Calcula la traza de una capacidad. Devuelve { error } si no existe, o { traza } con
 * { ca, requisitos, operaciones, globs, avisos, errores }.
 */
function calcularTraza(objetivo) {
  const { caps } = cargar()
  const cap = caps.get(objetivo)
  if (!cap) return { error: `la capacidad «${objetivo}» no existe en ${PRODUCTO}/` }

  const tracked = git('ls-files', '-z').split('\0').filter(Boolean)

  // criterios y requisitos, leídos con las mismas funciones que `validar`
  const criterios = []
  for (const { celdas } of filasDeTabla(cap.secciones['Criterios de aceptación']))
    if (RE_CA.test(celdas[0]))
      criterios.push({
        id: celdas[0],
        requisitos: (celdas[2] ?? '')
          .split(/[,·]/)
          .map((x) => x.trim())
          .filter(Boolean),
      })
  const requisitos = []
  for (const { celdas } of filasDeTabla(cap.secciones.Requisitos))
    if (RE_REQ.test(celdas[0])) requisitos.push({ id: celdas[0], estrella: (celdas[3] ?? '').includes('★') })

  // CA → tests (archivo:línea) por plataforma
  const tests = tracked
    .filter((f) => RE_ARCHIVO_TEST.test(f))
    .map((f) => {
      try {
        return { f, lineas: leer(f).split('\n') }
      } catch (e) {
        if (e instanceof ErrorEnlace) throw e
        return null
      }
    })
    .filter(Boolean)
  const ca = criterios.map((c) => {
    const re = new RegExp(`(?<![A-Za-z0-9-])${c.id}(?![A-Za-z0-9-])`)
    const porPlataforma = {}
    const otros = []
    for (const { f, lineas } of tests) {
      const n = lineas.findIndex((l) => re.test(l))
      if (n < 0) continue
      const p = plataformaDe(f)
      if (p) (porPlataforma[p] ??= []).push(`${f}:${n + 1}`)
      else otros.push(`${f}:${n + 1}`)
    }
    return { id: c.id, requisitos: c.requisitos, tests: porPlataforma, otros }
  })

  // estado por requisito y plataforma
  const iosVacio = Array.isArray(cap.cab?.codigo?.ios) && cap.cab.codigo.ios.length === 0
  const reqs = requisitos.map((r) => {
    const suyos = ca.filter((c) => c.requisitos.includes(r.id))
    const estado = {}
    for (const p of PLATAFORMAS_TRAZA) {
      if (p === 'ios' && iosVacio) estado[p] = '—'
      else {
        const con = suyos.filter((c) => (c.tests[p] ?? []).length > 0).length
        estado[p] = con === 0 ? '⬜' : con === suyos.length ? '✅' : '🟡'
      }
    }
    return { id: r.id, estrella: r.estrella, ca: suyos.map((c) => c.id), estado }
  })

  // operationId → método, ruta y route.ts
  const errores = []
  const rutasOp = new Map()
  const fOpenapi = 'packages/contracts/openapi/v1.json'
  if (existe(fOpenapi)) {
    const spec = JSON.parse(leer(fOpenapi))
    for (const [ruta, item] of Object.entries(spec.paths ?? {}))
      for (const [metodo, op] of Object.entries(item))
        if (op && typeof op === 'object' && op.operationId)
          rutasOp.set(op.operationId, { metodo: metodo.toUpperCase(), ruta })
  }
  const ids = [...(cap.cab?.operaciones ?? []), ...cap.pantallas.flatMap((p) => p.cab?.operaciones ?? [])]
  const operaciones = [...new Set(ids)].map((id) => {
    const r = rutasOp.get(id)
    if (!r) {
      errores.push(`operationId «${id}»: no existe en ${fOpenapi}`)
      return { id, metodo: null, ruta: null, archivo: null, existe: false }
    }
    const archivo = `apps/api/app/api/v1${r.ruta.replace(/\{([^}]+)\}/g, '[$1]')}/route.ts`
    const existe = tracked.includes(archivo)
    if (!existe) errores.push(`operationId «${id}»: ${r.metodo} ${r.ruta} no tiene ${archivo}`)
    return { id, metodo: r.metodo, ruta: r.ruta, archivo, existe }
  })

  // globs de codigo
  const globs = []
  const fuentes = [{ file: cap.file, cab: cap.cab }, ...cap.pantallas.map((p) => ({ file: p.file, cab: p.cab }))]
  for (const { file, cab } of fuentes) {
    if (!cab?.codigo || typeof cab.codigo !== 'object') continue
    for (const [plataforma, lista] of Object.entries(cab.codigo))
      for (const glob of lista) {
        const re = globARegex(glob)
        globs.push({ file, plataforma, glob, archivos: tracked.filter((f) => re.test(f)).length })
      }
  }

  // avisos
  const avisos = []
  for (const c of ca)
    if (Object.keys(c.tests).length === 0 && c.otros.length === 0) avisos.push(`${c.id} no tiene ningún test`)
  for (const r of reqs)
    if (r.estrella)
      for (const p of ['web', 'android'])
        if (r.estado[p] === '⬜') avisos.push(`${r.id} (★) sin test en ${p}`)
  for (const o of operaciones) if (!o.metodo) avisos.push(`operationId «${o.id}» sin ruta`)

  return { traza: { capacidad: objetivo, ca, requisitos: reqs, operaciones, globs, avisos, errores } }
}

function imprimirTraza(t) {
  const out = [`Traza de «${t.capacidad}»`, '', '## Criterios de aceptación → tests', '']
  for (const c of t.ca) {
    out.push(`${c.id}  (${c.requisitos.join(', ') || '—'})`)
    if (Object.keys(c.tests).length === 0 && c.otros.length === 0) out.push('  sin tests')
    for (const p of PLATAFORMAS_TRAZA) for (const x of c.tests[p] ?? []) out.push(`  ${p.padEnd(8)} ${x}`)
    for (const x of c.otros) out.push(`  otros    ${x}`)
  }
  out.push(
    '',
    '## Requisitos → estado por plataforma',
    '',
    '| Requisito | ★ | CA | web | android | ios | backend |',
    '|---|---|---|---|---|---|---|',
  )
  for (const r of t.requisitos)
    out.push(
      `| ${r.id} | ${r.estrella ? '★' : ''} | ${r.ca.join(', ') || '—'} | ${PLATAFORMAS_TRAZA.map((p) => r.estado[p]).join(' | ')} |`,
    )
  out.push('', '## Operaciones → rutas', '')
  for (const o of t.operaciones)
    out.push(
      o.metodo
        ? `${o.existe ? '✔' : '✖'} ${o.id}  ${o.metodo} ${o.ruta}  →  ${o.archivo}${o.existe ? '' : '  (NO EXISTE)'}`
        : `✖ ${o.id}  sin ruta en el contrato`,
    )
  out.push('', '## Código declarado (archivos rastreados que casa cada glob)', '')
  for (const g of t.globs)
    out.push(`${String(g.archivos).padStart(3)}  ${g.plataforma.padEnd(8)} ${g.glob}  (${g.file.replace(`${PRODUCTO}/`, '')})`)
  out.push('', '## Avisos', '')
  if (t.avisos.length === 0) out.push('Ninguno.')
  for (const a of t.avisos) out.push(`⚠ ${a}`)
  if (t.errores.length) {
    out.push('', '## Errores', '')
    for (const e of t.errores) out.push(`✖ ${e}`)
  }
  return out.join('\n')
}

// ───────────────────────── main

function main() {
  const [cmd, ...resto] = process.argv.slice(2)
  const flags = resto.filter((a) => a.startsWith('--'))
  const pos = resto.filter((a) => !a.startsWith('--'))

  if (cmd === 'validar') {
    const aviso = flags.includes('--aviso')
    const { errores, conteo } = validar({ objetivo: pos[0] })
    if (errores.length) {
      const marca = aviso ? '⚠' : '✖'
      const log = aviso ? console.log : console.error
      log(`${marca} spec:validar — ${errores.length} ${aviso ? 'aviso(s)' : 'problema(s)'}:\n`)
      for (const e of errores) log(`  ${e}`)
      process.exit(aviso ? 0 : 1)
    }
    console.log(
      `✔ spec:validar — ${conteo.cap} capacidades, ${conteo.pant} pantallas, ${conteo.req} requisitos, ${conteo.ca} criterios`,
    )
    return
  }

  if (cmd === 'indice') {
    const { errores, texto } = generarIndice()
    if (errores.length) {
      console.error(`✖ spec:indice — no se puede generar con ${errores.length} problema(s) de cabecera:\n`)
      for (const e of errores) console.error(`  ${e}`)
      process.exit(1)
    }
    const destino = `${PRODUCTO}/README.md`
    if (flags.includes('--check')) {
      const actual = esArchivo(destino) ? leer(destino) : null
      if (actual !== texto) {
        console.error(`✖ spec:indice — ${destino} no coincide con lo que se generaría: ejecuta pnpm spec:indice`)
        process.exit(1)
      }
      console.log(`✔ spec:indice — ${destino} al día`)
      return
    }
    // Solo se escribe un archivo normal dentro del repo: un enlace simbólico en el camino podría hacer que el índice
    // pise otro archivo (Codex, PR #186, CAX-001).
    const enlace = tramoEnlace(destino)
    if (enlace) {
      console.error(`✖ spec:indice — ${enlace} es un enlace simbólico: no se escribe el índice a través de él`)
      process.exit(1)
    }
    writeFileSync(rutaAbs(destino), texto, 'utf8')
    console.log(`✔ spec:indice — ${destino} escrito`)
    return
  }

  if (cmd === 'traza') {
    if (pos.length !== 1 || !RE_ID_PLANO.test(pos[0]) || flags.some((f) => f !== '--json')) {
      console.error('uso: node scripts/spec.mjs traza <capacidad> [--json]')
      process.exit(2)
    }
    const { error, traza } = calcularTraza(pos[0])
    if (error) {
      console.error(`✖ spec:traza — ${error}`)
      process.exit(1)
    }
    console.log(flags.includes('--json') ? JSON.stringify(traza, null, 2) : imprimirTraza(traza))
    process.exit(traza.errores.length ? 1 : 0)
  }

  console.error('uso: node scripts/spec.mjs validar [<capacidad>] [--aviso] | indice [--check] | traza <capacidad> [--json]')
  process.exit(2)
}

try {
  main()
} catch (e) {
  if (!(e instanceof ErrorEnlace)) throw e
  console.error(`✖ spec:${process.argv[2] ?? ''} — ${e.message}`)
  process.exit(1)
}
