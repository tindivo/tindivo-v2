#!/usr/bin/env node
/**
 * Guardarraíl del design system.
 *
 * No limpia nada: impide que vuelva a ensuciarse. Las 143 superficies de botón
 * escritas a mano que motivaron las variantes `soft` y `success` aparecieron
 * porque nada las señalaba en review. Esto las señala.
 *
 * Regla: un `<button>` que pinta su propia superficie (fondo + forma) está
 * reimplementando `<Button>` o `<IconButton>` de @tindivo/ui.
 *
 *   pnpm check:ds            → falla si hay infracciones nuevas
 *   pnpm check:ds --update   → regraba la línea base tras una migración
 *
 * La línea base existe porque el código actual tiene infracciones conocidas: el
 * guardarraíl entra en vigor hoy y se aprieta según se vayan migrando, en vez
 * de bloquear el repo hasta terminar.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const BASELINE = join(ROOT, 'scripts', 'design-system-baseline.json')
const UPDATE = process.argv.includes('--update')

/** Superficie = fondo de marca/estado + forma. Layout y tipografía no cuentan. */
const SURFACE = /\bbg-(brand|ink|danger|success|warning|card|surface)\b|\bbg-(brand|ink|danger|success)\//
const SHAPE = /\brounded-(full|xl|2xl|lg)\b/

/** Extrae cada `<button ...>` respetando llaves y comillas anidadas de JSX. */
function buttonTags(src) {
  const out = []
  const re = /<button\b/g
  let m
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length
    let depth = 0
    let quote = null
    const buf = []
    while (i < src.length) {
      const c = src[i]
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null
        buf.push(c)
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c
        buf.push(c)
      } else if (c === '{') {
        depth++
        buf.push(c)
      } else if (c === '}') {
        depth--
        buf.push(c)
      } else if (c === '>' && depth === 0) {
        break
      } else {
        buf.push(c)
      }
      i++
    }
    out.push({ tag: buf.join(''), line: src.slice(0, m.index).split('\n').length })
  }
  return out
}

const files = globSync('{apps,packages}/**/*.tsx', {
  cwd: ROOT,
  exclude: (p) => p.includes('node_modules') || p.includes('.next'),
})

/**
 * Huella de una infracción: fichero + hash del tag, NO fichero + línea.
 *
 * Anclar por línea hacía que el gate se pusiera rojo cada vez que alguien
 * editaba cualquier cosa POR ENCIMA de una infracción ya conocida: la misma
 * infracción se reportaba como "resuelta" en su línea vieja y "nueva" en la
 * nueva. Pasó de verdad con el sprint de negocios —cards.tsx 248→280,
 * nuevo-form.tsx 142→146 y 70→76— sin que nadie hubiera empeorado nada. Un
 * guardarraíl que grita en falso se acaba ignorando, que es la peor forma de
 * perder un guardarraíl.
 *
 * El hash se calcula sobre el tag con los espacios normalizados, así que
 * reformatear no cuenta como infracción nueva, pero CAMBIAR las clases sí — y
 * debe: si alguien retoca la superficie de un botón exento, vuelve a revisarse.
 */
function fingerprint(file, tag) {
  const normalized = tag.replace(/\s+/g, ' ').trim()
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12)
  return `${file.replace(/\\/g, '/')}#${hash}`
}

const found = []
/** Huella -> línea actual, solo para que el informe diga dónde mirar. */
const lineOf = new Map()
for (const file of files) {
  // packages/ui ES la implementación: ahí sí se pinta la superficie.
  if (file.replace(/\\/g, '/').startsWith('packages/ui/')) continue
  const src = readFileSync(join(ROOT, file), 'utf8')
  for (const { tag, line } of buttonTags(src)) {
    if (SURFACE.test(tag) && SHAPE.test(tag)) {
      const id = fingerprint(file, tag)
      found.push(id)
      lineOf.set(id, line)
    }
  }
}
found.sort()

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify({ allowed: found }, null, 2)}\n`)
  console.log(`Línea base regrabada: ${found.length} infracciones conocidas.`)
  process.exit(0)
}

const baseline = existsSync(BASELINE)
  ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).allowed)
  : new Set()

const nuevas = found.filter((f) => !baseline.has(f))
const resueltas = [...baseline].filter((f) => !found.includes(f))

if (resueltas.length) {
  console.log(`${resueltas.length} infracción(es) resueltas. Corre \`pnpm check:ds --update\`.`)
}

if (nuevas.length) {
  console.error(`\n${nuevas.length} <button> pinta su propia superficie:\n`)
  // La huella lleva hash, que no sirve para ir a mirar. El informe enseña
  // fichero:línea, que es lo que se pega en el editor.
  for (const f of nuevas) console.error(`  ${f.split('#')[0]}:${lineOf.get(f)}`)
  console.error(
    '\nUsa <Button> o <IconButton> de @tindivo/ui.' +
      '\nVariantes: brand · soft · outline · ghost · danger · success · secondary' +
      '\nSi de verdad es un caso aparte, documenta por qué y corre `pnpm check:ds --update`.\n',
  )
  process.exit(1)
}

console.log(`OK — sin superficies de botón nuevas fuera de @tindivo/ui (${found.length} conocidas).`)
