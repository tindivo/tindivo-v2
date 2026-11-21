/**
 * `pnpm tokens:build` escribe las salidas; `pnpm tokens:check` (`--check`) falla si lo versionado no es lo que
 * saldría de `tokens.json`. Código de salida: 0 todo al día, 1 hay diferencias o tokens inválidos.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadTokens, PACKAGE_ROOT, render } from './generate.ts'

const check = process.argv.includes('--check')
let drift = 0

try {
  const out = render(loadTokens())
  for (const [path, content] of Object.entries(out)) {
    const file = PACKAGE_ROOT + path
    if (check) {
      let onDisk = ''
      try {
        onDisk = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      } catch {
        // no existe: cuenta como desactualizado
      }
      if (onDisk === content) {
        console.log(`ok: ${path}`)
      } else {
        console.error(`DESACTUALIZADO: packages/design-tokens/${path} (corre pnpm tokens:build)`)
        drift++
      }
    } else {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content, 'utf8')
      console.log(`escrito: packages/design-tokens/${path}`)
    }
  }
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
process.exit(drift > 0 ? 1 : 0)
