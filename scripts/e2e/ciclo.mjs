#!/usr/bin/env node
/**
 * La secuencia que corre BAJO el candado de la base (`pnpm db:lock run -- node scripts/e2e/ciclo.mjs [--reset]`):
 * opcionalmente `supabase db reset` → espera de Auth y Storage → seed e2e, y siempre los escenarios por la API.
 * Encadena los pasos desde aquí, sin pasar `&&` por la shell, para que valga igual en Windows, macOS y Linux. Los hijos
 * heredan el entorno (el token del candado) y la salida; el primero que falla corta la secuencia con su código.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const isWin = process.platform === 'win32'

function paso(titulo, cmd, args, { cmdShim = false } = {}) {
  console.log(`\n▶ ${titulo}`)
  // Solo `pnpm` es un `.cmd` en Windows; sus argumentos son fijos y sin espacios.
  const r = spawnSync(cmd, args, { cwd: REPO, stdio: 'inherit', shell: cmdShim && isWin })
  if (r.status !== 0) {
    console.error(`\nSe corta en «${titulo}» (código ${r.status ?? 1}).`)
    process.exit(r.status ?? 1)
  }
}

if (process.argv.includes('--reset')) {
  paso('supabase db reset', 'supabase', ['db', 'reset'])
  paso('esperar Auth y Storage', process.execPath, ['scripts/e2e/espera-auth.mjs'])
  paso('seed e2e', 'pnpm', ['db:seed:e2e'], { cmdShim: true })
}
paso('escenarios por la API', process.execPath, ['scripts/e2e/flujo-completo.ts', '--check-events'])
