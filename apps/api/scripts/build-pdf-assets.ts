#!/usr/bin/env node
/**
 * Genera `apps/api/lib/pdf/brand-assets.ts` a partir de los binarios de
 * `apps/api/lib/pdf/assets/`.
 *
 *   pnpm pdf:assets
 *
 * POR QUÉ SE GENERA UN .TS Y NO SE LEE EL FICHERO EN RUNTIME.
 *
 * Porque leer ficheros en runtime es LA CAUSA del bug que este mismo cambio
 * arregla. `@sparticuz/chromium` localiza sus binarios con un `join()` en
 * tiempo de ejecución, el análisis estático de Next no tiene ningún import al
 * que seguir, los ficheros no viajaron al bundle de la función, y el PDF
 * llevaba días caído en producción con un error que solo se veía en los logs
 * de Vercel.
 *
 * Un `readFileSync(join(__dirname, 'assets', ...))` aquí tendría exactamente el
 * mismo modo de fallo, y encima uno más silencioso: sin fuentes el PDF no
 * revienta, sale feo. Embebido en base64 dentro de un módulo TypeScript, el
 * bundler lo trata como lo que es —una constante— y no hay traza que pueda
 * fallar.
 *
 * El precio es un fichero generado de ~140 KB en el repo. Es un precio justo.
 *
 * QUÉ HAY EN `assets/` Y DE DÓNDE SALE:
 *
 *   · `geist-latin-var.woff2`          Geist variable 400-800, subset latin.
 *   · `jetbrains-mono-latin-var.woff2` JetBrains Mono variable 500-700, latin.
 *     Los dos de Google Fonts (SIL Open Font License 1.1). Son las MISMAS
 *     familias que `packages/ui/src/theme.css` declara para las apps, así que
 *     el PDF y la pantalla usan la misma tipografía.
 *   · `tindivo-mark.png`               Copia de `apps/customer/public/
 *     icon-192x192.png`, el isotipo sobre fondo claro.
 *
 * CUÁNDO CORRERLO: solo si cambias algún fichero de `assets/`. No hace falta en
 * cada build, y por eso no está enganchado a `pnpm build`: un generador que
 * corre siempre acaba metiendo ruido en cada diff.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `fileURLToPath` y no `new URL(...).pathname`: en Windows ese `pathname` llega
// con el espacio de «Tinkuy Creativo» escapado como %20. Mismo motivo que
// documenta `scripts/check-deploy-order.mjs`.
const AQUI = fileURLToPath(new URL('.', import.meta.url))
const ASSETS = join(AQUI, '..', 'lib', 'pdf', 'assets')
const SALIDA = join(AQUI, '..', 'lib', 'pdf', 'brand-assets.ts')

interface Asset {
  constante: string
  fichero: string
  mime: string
  descripcion: string
}

const ASSET_LIST: Asset[] = [
  {
    constante: 'GEIST_WOFF2',
    fichero: 'geist-latin-var.woff2',
    mime: 'font/woff2',
    descripcion: 'Geist variable 400-800 (subset latin)',
  },
  {
    constante: 'JETBRAINS_MONO_WOFF2',
    fichero: 'jetbrains-mono-latin-var.woff2',
    mime: 'font/woff2',
    descripcion: 'JetBrains Mono variable 500-700 (subset latin)',
  },
  {
    constante: 'TINDIVO_MARK_PNG',
    fichero: 'tindivo-mark.png',
    mime: 'image/png',
    descripcion: 'Isotipo Tindivo 192x192',
  },
]

function dataUri(asset: Asset): string {
  const bytes = readFileSync(join(ASSETS, asset.fichero))
  return `data:${asset.mime};base64,${bytes.toString('base64')}`
}

const cuerpo = ASSET_LIST.map((a) => {
  const uri = dataUri(a)
  const kb = (uri.length / 1024).toFixed(0)
  return `/** ${a.descripcion} — ${a.fichero} (${kb} KB en base64). */\nexport const ${a.constante} =\n  '${uri}'`
}).join('\n\n')

const cabecera = `// GENERADO POR \`pnpm pdf:assets\` — NO EDITAR A MANO.
//
// Fuente: \`apps/api/lib/pdf/assets/\`. Para cambiar algo, cambia el binario de
// esa carpeta y vuelve a generar; editar aquí se pierde en la siguiente pasada.
//
// Van embebidos en base64 en vez de leerse del disco a propósito: un
// \`readFileSync\` en runtime depende del file tracing de Next, y eso es justo lo
// que dejó el PDF roto en producción el 2026-09-08. El detalle está en
// \`apps/api/scripts/build-pdf-assets.ts\` y en \`next.config.ts\`.
//
// Geist y JetBrains Mono son SIL Open Font License 1.1.
`

writeFileSync(SALIDA, `${cabecera}\n${cuerpo}\n`, 'utf8')

const total = ASSET_LIST.reduce((s, a) => s + dataUri(a).length, 0)
console.log(`brand-assets.ts generado — ${ASSET_LIST.length} assets, ${(total / 1024).toFixed(0)} KB`)
