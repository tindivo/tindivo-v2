#!/usr/bin/env node
/**
 * `pnpm e2e:todo`: corre la parte de punta a punta que se puede correr en este PC y dice qué corre solo en la CI.
 *
 *   pnpm e2e:todo                 escenarios por la API REST (scripts/e2e/flujo-completo.ts) contra la base LOCAL, bajo candado
 *   pnpm e2e:todo --reset         antes, `supabase db reset` + `pnpm db:seed:e2e` (también bajo candado)
 *   pnpm e2e:todo --playwright    después, `pnpm test:e2e` (web de negocio y motorizado; necesita las apps web)
 *
 * Levanta la API en :3001 si no responde y la apaga al terminar. Si el candado de la base está ocupado, se niega
 * (código 75): no lo fuerza. La salida es la de cada comando, tal cual; el código de salida es el del primero que falle.
 * Sin `--reset`, cada corrida suma clientes nuevos y pedidos entregados; los escenarios no dependen de ese estado (el no-show usa un cliente propio), pero si algo falla por «primer pedido con pago adelantado» o por un pedido activo, repite con `--reset`.
 * Contra staging se corre a mano: `Docs/operacion/e2e-flujo-completo.md`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HEALTH = 'http://localhost:3001/api/v1/health'
const args = new Set(process.argv.slice(2))
const isWin = process.platform === 'win32'
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm'

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: REPO, stdio: 'inherit', shell: isWin })
  return r.status ?? 1
}

async function healthy() {
  try {
    return (await fetch(HEALTH)).ok
  } catch {
    return false
  }
}

async function main() {
  let api = null
  if (!(await healthy())) {
    console.log('> API local apagada: arrancando `pnpm --filter @tindivo/api dev`')
    api = spawn(pnpm, ['--filter', '@tindivo/api', 'dev'], { cwd: REPO, stdio: 'ignore', shell: isWin })
    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      up = await healthy()
    }
    if (!up) {
      stop(api)
      console.error('La API no respondió en 120 s.')
      process.exit(1)
    }
  }

  let code = 0
  try {
    const full = ['db:lock', 'run', '--', 'node', 'scripts/e2e/ciclo.mjs', ...(args.has('--reset') ? ['--reset'] : [])]
    console.log(`\n> ${pnpm} ${full.join(' ')}`)
    code = run(pnpm, full)
    if (code === 0 && args.has('--playwright')) {
      console.log('\n> pnpm test:e2e')
      code = run(pnpm, ['test:e2e'])
    }
  } finally {
    stop(api)
  }

  console.log(`
Qué NO corrió aquí (corre solo en la CI o a mano):
  - Maestro (Android): flujos en apps/android/maestro/flows. En este PC no hay SDK de Android ni emulador.
    CI: .github/workflows/android-maestro.yml (propuesta, solo por workflow_dispatch, solo el flujo del invitado).
    Los flujos con sesión de Google se corren en un dispositivo con la sesión hecha (apps/android/maestro/README.md).
  - Contra staging: node scripts/e2e/flujo-completo.ts --staging ... (Docs/operacion/e2e-flujo-completo.md).
    Los escenarios que usan la service role (prepago vencido, SMS, Entregas, borrar cuenta) se saltan allí.
  - Push real, Google Sign-In real, SMS real, cámara y mapa: prueba manual (Docs/trabajo/e2e/escenarios.md).
${args.has('--playwright') ? '' : '  - Playwright web: pnpm e2e:todo --playwright (o pnpm test:e2e).\n'}`)
  process.exit(code)
}

function stop(child) {
  if (!child?.pid) return
  if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

main()
