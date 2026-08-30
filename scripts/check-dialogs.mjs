#!/usr/bin/env node
/**
 * Guardarraíl de los diálogos.
 *
 * No limpia nada: impide que vuelva a ensuciarse. Las 26 hojas de `BottomSheet`
 * y los 16 overlays a mano que se nombraron aparecieron sin nombre porque nada
 * los señalaba en review — un `role="dialog"` mudo se ve perfecto en pantalla y
 * un lector de pantalla anuncia «diálogo» y nada más. Esto los señala.
 *
 *   pnpm check:dialogs
 *
 * DOS REGLAS, Y LAS DOS MIRAN LO MISMO: que lo que se abre encima tenga nombre.
 *
 *   1. Un `role="dialog"` necesita `aria-label` o `aria-labelledby`.
 *   2. Un overlay a pantalla completa (`fixed inset-0`) tiene que declarar QUÉ
 *      es: `role="dialog"` si es un diálogo, o `role="presentation"` / un
 *      `<button>` con `aria-label` si es solo el telón que cierra al pulsar.
 *      Sin rol, la capa existe para el ratón y no para nadie más.
 *
 * `BottomSheet` de @tindivo/ui no entra en la regla 2: ya exige `label` por
 * tipo, que es un guardarraíl mejor —lo comprueba el compilador— y por eso los
 * ficheros que lo usan se saltan esta comprobación.
 *
 * NO HAY LÍNEA BASE, a diferencia de `check:ds`. Se entra en vigor con el
 * contador a cero porque ya está a cero: si aparece uno nuevo, es de hoy.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { relative } from 'node:path'

const ROOT = process.cwd()

const ficheros = globSync('{apps,packages}/**/*.tsx', {
  cwd: ROOT,
  exclude: (p) => p.includes('node_modules') || p.includes('.next'),
})

/** Un overlay que tapa la pantalla entera. */
const OVERLAY = /className="[^"]*\bfixed inset-0\b/
/** Cualquier rol que declare qué es la capa. */
const TIENE_ROL = /role="(dialog|presentation|button|alertdialog)"/
/** El nombre accesible, en cualquiera de sus dos formas. */
const TIENE_NOMBRE = /aria-label(?:ledby)?=/

const fallos = []

for (const rel of ficheros) {
  const src = readFileSync(rel, 'utf8')
  const lineas = src.split('\n')

  // Los que montan un BottomSheet ya están cubiertos por el tipo de su `label`.
  const usaBottomSheet = src.includes('<BottomSheet')

  lineas.forEach((linea, i) => {
    const n = i + 1
    // Los comentarios hablan DE los roles sin declararlos: el bloque de doc de
    // `BottomSheet` explica su `role="dialog"` y se contaba como infracción.
    if (/^\s*(\*|\/\/|\/\*)/.test(linea)) return
    // La etiqueta JSX puede ocupar varias líneas: se mira el bloque, no la línea.
    const bloque = lineas.slice(Math.max(0, i - 6), i + 7).join('\n')

    if (/role="dialog"/.test(linea) && !TIENE_NOMBRE.test(bloque)) {
      fallos.push({
        archivo: relative(ROOT, rel),
        linea: n,
        motivo: 'role="dialog" sin aria-label ni aria-labelledby',
      })
    }

    // Vale con una de las dos: declarar QUÉ es, o tener nombre. Un `<button>`
    // que hace de telón ya trae su rol por ser lo que es, y lo que le faltaba
    // era el nombre; un `div` necesita decir si es diálogo o decoración.
    const declarado = TIENE_ROL.test(bloque) || TIENE_NOMBRE.test(bloque)

    if (OVERLAY.test(linea) && !usaBottomSheet && !declarado) {
      fallos.push({
        archivo: relative(ROOT, rel),
        linea: n,
        motivo: 'overlay `fixed inset-0` que no declara si es diálogo o telón',
      })
    }
  })
}

if (fallos.length) {
  console.error(`\n${fallos.length} capa(s) sin nombre o sin rol:\n`)
  for (const f of fallos) console.error(`  ${f.archivo}:${f.linea}  — ${f.motivo}`)
  console.error(
    '\nSi es un diálogo: `role="dialog" aria-modal="true" aria-label="…"`,' +
      '\ncon el mismo texto que ya pinta su encabezado (súbelo a una constante' +
      '\npara que no puedan separarse).' +
      '\nSi es el telón que cierra al pulsar: `role="presentation"`, o un' +
      '\n`<button aria-label="Cerrar">`.' +
      '\nY si es una hoja inferior, usa `BottomSheet` de @tindivo/ui: su `label`' +
      '\nes obligatoria y la comprueba el compilador.\n',
  )
  process.exit(1)
}

console.log(`OK — ${ficheros.length} ficheros, toda capa modal declara qué es y cómo se llama.`)
