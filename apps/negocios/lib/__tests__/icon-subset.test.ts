import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `negocios` es la única app que auto-hospeda Material Symbols, y lo hace
 * recortada: `public/fonts/material-symbols-rounded.woff2` solo trae las
 * ligaduras listadas en `public/fonts/icons.txt` (92 KB en vez de 4.8 MB, para
 * que el panel arranque con la conectividad del piloto).
 *
 * El precio es que usar un `name` que no está en esa lista no rompe nada: la
 * ligadura no existe, el `::before` se queda con el nombre en letras sueltas y
 * el `overflow-hidden` de la primitiva lo recorta a un garabato del ancho del
 * icono. Parece un icono mal dibujado, no un icono que falta, así que se cuela
 * en las revisiones. Ya pasó con `near_me`, `route` y `fastfood`, y otra vez
 * con `person_pin_circle` (la insignia de «cliente presente», el único aviso
 * de la tarjeta que dice que hay alguien en el mostrador) y
 * `format_list_bulleted`.
 *
 * Este test es el paso 1 del README de `public/fonts`: recolecta los nombres
 * del código y comprueba que la fuente los trae. Si sale rojo, hay que
 * regenerar el subset siguiendo ese README — no basta con editar `icons.txt`,
 * que es solo el inventario de lo que se metió en el `.woff2`.
 */

const RAIZ_NEGOCIOS = resolve(__dirname, '../..')
const RAIZ_UI = resolve(__dirname, '../../../../packages/ui')

const IGNORADOS = new Set(['node_modules', '.next', '.turbo', 'dist'])

function* ficheros(dir: string): Generator<string> {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORADOS.has(entrada.name)) continue
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      yield* ficheros(ruta)
    } else if (entrada.name.endsWith('.tsx') || entrada.name.endsWith('.ts')) {
      yield ruta
    }
  }
}

/**
 * Las cinco formas en que un nombre de icono llega a la primitiva. La primera
 * versión del recolector solo cubría tres y por eso se perdió `icon="..."`.
 */
const PATRONES = [
  /\bname="([a-z0-9_]+)"/g,
  /\bicon="([a-z0-9_]+)"/g,
  /\bicon:\s*'([a-z0-9_]+)'/g,
  /\bname=\{[^}]*'([a-z0-9_]+)'[^}]*\}/g,
  /\bicon=\{[^}]*'([a-z0-9_]+)'[^}]*\}/g,
]

function nombresUsados(): Set<string> {
  const usados = new Set<string>()
  for (const raiz of [RAIZ_NEGOCIOS, RAIZ_UI]) {
    for (const ruta of ficheros(raiz)) {
      const fuente = readFileSync(ruta, 'utf8')
      for (const patron of PATRONES) {
        for (const [, nombre] of fuente.matchAll(patron)) usados.add(nombre)
      }
    }
  }
  return usados
}

describe('subset de iconos', () => {
  it('la fuente auto-hospedada trae todos los iconos que el panel usa', () => {
    const inventario = new Set(
      readFileSync(join(RAIZ_NEGOCIOS, 'public/fonts/icons.txt'), 'utf8')
        .split('\n')
        .map((linea) => linea.trim())
        .filter(Boolean),
    )
    const faltan = [...nombresUsados()].filter((nombre) => !inventario.has(nombre)).sort()
    expect(faltan).toEqual([])
  })
})
