#!/usr/bin/env node
/**
 * Guardarraíl de las salidas de sesión.
 *
 * No limpia nada: impide que vuelva a ensuciarse. El 2026-08-17 se encontró que
 * 5 de los 6 sitios que cerraban sesión llamaban a `auth.signOut()` a secas, o
 * sea `scope: 'global'`, que revoca TODOS los refresh tokens del usuario. El
 * síntoma en producción: dos teléfonos con la misma cuenta de motorizado,
 * cerrar sesión en uno echaba al otro.
 *
 * Los specs ya lo prohibían por escrito desde el principio (`Docs/05-api-rest.md`
 * §2, RNF-SEC-01, HU-X-005). No sirvió de nada, porque nada lo comprobaba. Esto
 * lo comprueba.
 *
 *   pnpm check:auth
 *
 * Sin línea base a propósito: al nacer este guardarraíl las infracciones eran
 * cero, así que cualquiera que aparezca es nueva y no hay nada que tolerar.
 */
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/**
 * Único módulo autorizado a tocar el scope de una salida de sesión.
 *
 * Los dos helpers viven juntos —el local y el de todos los dispositivos— para
 * que quien lea uno vea el otro, y para que el guardarraíl tenga un solo fichero
 * exento en vez de una lista que se va estirando.
 */
const MODULO_AUTORIZADO = 'packages/supabase/src/sign-out-local.ts'

/** Único módulo autorizado a construir el cliente Supabase del navegador. */
const FABRICA_DE_CLIENTE = 'packages/supabase/src/client-helpers.ts'

const REGLAS = [
  {
    id: 'signout-directo',
    patron: /\.auth\s*\.\s*signOut\s*\(/,
    mensaje:
      'llama a `auth.signOut()` directamente. Sin argumentos usa scope GLOBAL y\n' +
      '    revoca la sesión del usuario en TODOS sus dispositivos.\n' +
      '    Usa `signOutLocal(client)` de @tindivo/supabase.',
  },
  {
    id: 'scope-global',
    patron: /scope\s*:\s*['"]global['"]/,
    mensaje:
      'fija `scope: "global"` a mano. Cerrar todas las sesiones es una decisión\n' +
      '    deliberada del usuario, no un efecto secundario de cerrar sesión aquí.\n' +
      '    Usa `signOutEverywhere(client)` de @tindivo/supabase.',
  },
  {
    id: 'cliente-browser-suelto',
    patron: /createBrowserClient\s*[<(]/,
    exento: (rel) => rel === FABRICA_DE_CLIENTE,
    mensaje:
      'construye su propio cliente de navegador. Sin un `storageKey` propio, dos\n' +
      '    apps del mismo dominio se pisan la sesión (en local solo cambia el puerto).\n' +
      `    Usa \`createTindivoBrowserClient(storageKey)\` de @tindivo/supabase/client.`,
  },
]

/**
 * Las reglas buscan CÓDIGO, no prosa. Sin este filtro el propio comentario que
 * explica el bug haría fallar el guardarraíl, y un guardarraíl que grita en
 * falso se acaba ignorando — que es la peor forma de perderlo.
 */
function esComentario(linea) {
  const t = linea.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

const ficheros = globSync('{apps,packages,e2e}/**/*.{ts,tsx}', {
  cwd: ROOT,
  exclude: (p) => p.includes('node_modules') || p.includes('.next'),
})

if (ficheros.length === 0) {
  console.error('check:auth no encontró ficheros que revisar. ¿Se corre desde la raíz del repo?')
  process.exit(1)
}

// El fichero exento tiene que EXISTIR. Si alguien lo renombra o lo borra, la
// exención pasaría a no cubrir nada y el guardarraíl seguiría en verde mientras
// los helpers viven en otro sitio sin vigilancia.
for (const exento of [MODULO_AUTORIZADO, FABRICA_DE_CLIENTE]) {
  if (existsSync(join(ROOT, exento))) continue
  console.error(`check:auth: no existe el módulo autorizado ${exento}.`)
  console.error('Si se movió, actualiza la ruta en scripts/check-auth-boundaries.mjs.')
  process.exit(1)
}

const infracciones = []
for (const fichero of ficheros) {
  const rel = fichero.replace(/\\/g, '/')

  const lineas = readFileSync(join(ROOT, fichero), 'utf8').split('\n')
  lineas.forEach((linea, i) => {
    if (esComentario(linea)) return
    for (const regla of REGLAS) {
      // Cada regla tiene su propia exención; por defecto, el módulo de salidas
      // de sesión. Sin `exento` propio, una regla nueva queda vigilando también
      // ese fichero, que es lo prudente.
      const exenta = regla.exento ? regla.exento(rel) : rel === MODULO_AUTORIZADO
      if (exenta) continue
      if (regla.patron.test(linea)) {
        infracciones.push({ fichero: rel, linea: i + 1, regla })
      }
    }
  })
}

if (infracciones.length > 0) {
  console.error(`\n${infracciones.length} infracción(es) de los límites de sesión:\n`)
  for (const inf of infracciones) {
    console.error(`  ${inf.fichero}:${inf.linea}  [${inf.regla.id}]`)
    console.error(`    ${inf.regla.mensaje}\n`)
  }
  console.error('Contexto: HU-X-005 y RNF-SEC-01 — cerrar sesión NO cierra las de otros dispositivos.\n')
  process.exit(1)
}

console.log(`OK — ${ficheros.length} ficheros, sesiones dentro de sus límites.`)
