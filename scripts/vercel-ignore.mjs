// Ignored Build Step de Vercel. Semántica: exit 0 = SALTAR el build, exit 1 = CONSTRUIR.
// Producción nunca se salta; en previews se delega en turbo-ignore con versiones fijas.
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const TURBO_IGNORE_VERSION = '2.9.16'
export const TURBO_VERSION = '2.9.16'

export function buildCommand() {
  return {
    cmd: 'npx',
    args: [
      '--yes',
      `turbo-ignore@${TURBO_IGNORE_VERSION}`,
      '--turbo-version',
      TURBO_VERSION,
    ],
  }
}

function defaultRun({ cmd, args }) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.error || r.status === null) throw r.error ?? new Error('turbo-ignore terminó sin código')
  return r.status
}

export function decide({ env = process.env, run = defaultRun, log = console.log } = {}) {
  const branch = env.VERCEL_GIT_COMMIT_REF ?? 'desconocida'
  const vercelEnv = env.VERCEL_ENV ?? 'desconocido'
  try {
    if (vercelEnv === 'production') {
      log(`vercel-ignore: rama=${branch} VERCEL_ENV=${vercelEnv} -> construir (producción nunca se salta)`)
      return 1
    }
    const status = run(buildCommand())
    const code = status === 0 ? 0 : 1
    log(`vercel-ignore: rama=${branch} VERCEL_ENV=${vercelEnv} -> ${code === 0 ? 'saltar' : 'construir'}`)
    return code
  } catch (error) {
    log(`vercel-ignore: rama=${branch} VERCEL_ENV=${vercelEnv} -> construir (error: ${error?.message ?? error})`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(decide())
}
