#!/usr/bin/env node
/**
 * Guardarraíl de la documentación (estándar: Docs/README.md §8).
 *
 *   pnpm check:docs
 *
 * Mira solo lo que manda —el canon, los planes y las instrucciones de agentes—, no los documentos viejos que esperan
 * su reescritura. Cuatro reglas:
 *
 *   1. Todo enlace relativo existe. Un enlace roto en lo que manda manda a un agente a ninguna parte.
 *   2. Toda ruta del repo que nombre un AGENTS.md o un CLAUDE.md existe. Así nació `/specs`: una instrucción que
 *      apuntaba a una carpeta que nadie había creado. Una ruta futura se marca «`ruta` (por crear)».
 *   3. Cabeceras: el canon dice contra qué se verificó («Verificado:»), un ADR su estado («Estado:») y un plan el suyo.
 *   4. El canon no toma reglas de Docs/trabajo/: solo puede enlazarlo en una línea «Discusión:».
 *
 * Y un tope: el AGENTS.md raíz no pasa de 150 líneas (decisión de Jesús, 2026-11-18); lo que no cabe va al canon.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const ROOT = process.cwd()
const tracked = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const esAgentes = (f) => /(^|\/)(AGENTS|CLAUDE)\.md$/.test(f)
const CANON = ['Docs/negocio/', 'Docs/producto/', 'Docs/arquitectura/', 'Docs/operacion/', 'Docs/glosario.md', 'Docs/README.md']
const esCanon = (f) => CANON.some((c) => f.startsWith(c)) && f.endsWith('.md')
const esAdr = (f) => /^Docs\/decisiones\/\d{4}-.+\.md$/.test(f)
const esPlan = (f) => /^Docs\/planes\/[^/]+\/[^/]+\.md$/.test(f)

const alcance = tracked.filter((f) => esAgentes(f) || esCanon(f) || esAdr(f) || esPlan(f))
const errores = []
const avisos = []

const existe = (ruta) => {
  const p = join(ROOT, ruta)
  return existsSync(p) && (statSync(p).isFile() || statSync(p).isDirectory())
}

/** Resuelve un destino relativo al archivo; null si es una URL, un ancla o un marcador. */
function resolver(origen, destino) {
  const limpio = decodeURIComponent(destino.split('#')[0].split('?')[0]).replace(/^<|>$/g, '')
  if (!limpio || /^[a-z]+:/i.test(limpio)) return null
  const base = limpio.startsWith('/') ? '' : dirname(origen)
  return normalize(join(base, limpio.replace(/^\//, ''))).replaceAll('\\', '/')
}

const RAICES = /^(apps|packages|supabase|Docs|e2e|scripts|\.github|\.claude)\//
const EXTENSION = /\.(md|ts|tsx|mjs|js|json|sql|txt|toml|ya?ml|woff2)$/

for (const f of alcance) {
  const lineas = readFileSync(join(ROOT, f), 'utf8').split('\n')

  lineas.forEach((linea, i) => {
    const donde = `${f}:${i + 1}`
    // 1 y 4 · enlaces markdown
    for (const m of linea.matchAll(/\]\(([^)\s]+)\)/g)) {
      const r = resolver(f, m[1])
      if (r === null) continue
      if (!existe(r)) errores.push(`${donde} · enlace roto: ${m[1]}`)
      if (esCanon(f) && r.startsWith('Docs/trabajo/') && !/^\s*>?\s*Discusión:/.test(linea))
        errores.push(`${donde} · el canon toma de Docs/trabajo/ fuera de una línea «Discusión:»: ${m[1]}`)
    }
    // 2 · rutas nombradas en las instrucciones de agentes
    if (esAgentes(f)) {
      for (const m of linea.matchAll(/`([^`\s]+)`/g)) {
        const t = m[1].replace(/[.,;:]$/, '')
        if (/[<>{}*…]|\.\.\.|^\$/.test(t)) continue
        if (linea.slice(m.index + m[0].length).startsWith(' (por crear)')) continue
        if (!RAICES.test(t) && !(t.includes('/') && EXTENSION.test(t))) continue
        const candidatas = [t, normalize(join(dirname(f), t)).replaceAll('\\', '/')].map((x) => x.replace(/\/$/, ''))
        if (!candidatas.some(existe)) errores.push(`${donde} · ruta que no existe: ${t}`)
      }
    }
  })

  // 3 · cabeceras
  // La cabecera son las 12 primeras líneas después del bloque de metadatos (---), si lo hay: las capacidades de
  // Docs/producto/ empiezan con uno (Codex, PR #186, CAX-002).
  const cierre = lineas[0] === '---' ? lineas.indexOf('---', 1) : -1
  const cabeza = lineas.slice(cierre + 1, cierre + 13).join('\n')
  // En producto/ la cabecera va en capacidad.md y en el índice; las fichas de pantalla heredan la de su capacidad.
  const sinCabeceraPropia = f.startsWith('Docs/producto/') && (f.includes('/pantallas/') || f.includes('/_plantilla/'))
  if (esCanon(f) && !sinCabeceraPropia && !/^>\s*Verificado:/m.test(cabeza)) errores.push(`${f} · falta «> Verificado: …» en la cabecera`)
  if (esAdr(f) && !/^Estado:/m.test(cabeza)) errores.push(`${f} · al ADR le falta «Estado: …»`)
  if (esPlan(f) && !/Estado:/.test(cabeza)) errores.push(`${f} · al plan le falta «Estado: …» en la cabecera`)
}

const AGENTS_MAX_LINEAS = 150
// LF, CRLF y CR suelto cuentan como fin de línea (CAX-002): con solo LF, 151 líneas con CR pasarían como una.
const raiz = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')
  .replace(/(\r\n|\r|\n)$/, '')
  .split(/\r\n|\r|\n/).length
if (raiz > AGENTS_MAX_LINEAS)
  errores.push(`AGENTS.md tiene ${raiz} líneas (tope: ${AGENTS_MAX_LINEAS}): lo que no cabe va al canon y se enlaza`)

for (const a of avisos) console.warn(`⚠ ${a}`)
if (errores.length) {
  console.error(`✖ check:docs — ${errores.length} problema(s) en ${alcance.length} archivos que mandan:\n`)
  for (const e of errores) console.error(`  ${e}`)
  process.exit(1)
}
console.log(`✔ check:docs — ${alcance.length} archivos que mandan, sin enlaces rotos ni cabeceras ausentes`)
