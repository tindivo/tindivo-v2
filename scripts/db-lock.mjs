#!/usr/bin/env node
/**
 * Candado de la base LOCAL de Supabase (plan-diario.md §2.3).
 *
 * La suite de la API es de integración contra UNA sola base (127.0.0.1:54322) y
 * borra y siembra fixtures. Dos sesiones que hagan `db reset` → `db:seed:e2e` →
 * tests a la vez se pisan, y el rojo apunta a cualquier sitio menos al real. Un
 * worktree aísla el código, no la base: por eso el candado vive en el HOME del
 * usuario y no en el repo, y lo comparten todos los worktrees.
 *
 *   node scripts/db-lock.mjs cycle            reset → seed e2e → tests de la API (--force)
 *   node scripts/db-lock.mjs run -- "<cmd>"   cualquier comando bajo el candado (va a la shell tal cual)
 *   node scripts/db-lock.mjs status           quién lo tiene
 *
 * Reglas:
 *  - Se toma con `mkdir`, que es atómico también en NTFS: o lo creas tú o falla.
 *  - Se mantiene durante TODA la secuencia, no paso a paso.
 *  - NO caduca por antigüedad: un ciclo largo no es un ciclo muerto. Solo se
 *    declara huérfano si el proceso que lo tomó y todos los hijos que lanzó
 *    están muertos; y entonces se aparta con `rename` (atómico) antes de
 *    retomarlo, para que dos sesiones no lo hereden a la vez.
 *  - Nunca toca una base remota: `cycle` usa `supabase db reset` sin `--linked`
 *    y se niega a correr si el entorno apunta a otra URL que no sea local.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOCK_DIR = join(homedir(), '.tindivo', 'db-local-54322.lock')
const INFO = join(LOCK_DIR, 'holder.json')

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: existe pero es de otro usuario. Vivo, a efectos del candado.
    return error.code === 'EPERM'
  }
}

function readHolder() {
  try {
    return JSON.parse(readFileSync(INFO, 'utf8'))
  } catch {
    return null
  }
}

function writeHolder(holder) {
  writeFileSync(INFO, `${JSON.stringify(holder, null, 2)}\n`)
}

function describe(holder) {
  if (!holder) return 'sin datos del dueño (se está creando o quedó a medias)'
  const children = holder.children.length ? ` · hijos ${holder.children.join(', ')}` : ''
  return `pid ${holder.pid}${children} · desde ${holder.startedAt} · ${holder.command} · ${holder.cwd}`
}

function isOrphan(holder) {
  if (!holder) return false
  return !isAlive(holder.pid) && holder.children.every((pid) => !isAlive(pid))
}

function acquire(command) {
  mkdirSync(join(homedir(), '.tindivo'), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(LOCK_DIR)
      const holder = {
        pid: process.pid,
        children: [],
        startedAt: new Date().toISOString(),
        command,
        cwd: process.cwd(),
      }
      writeHolder(holder)
      return holder
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const holder = readHolder()
      if (!isOrphan(holder)) {
        console.error(`🔒 La base local está ocupada: ${describe(holder)}`)
        console.error('   Espera a que termine. No se libera por antigüedad (plan-diario.md §2.3).')
        process.exit(75)
      }
      const aside = `${LOCK_DIR}.huerfano-${Date.now()}`
      try {
        renameSync(LOCK_DIR, aside)
      } catch {
        continue // otra sesión lo apartó antes; se reintenta el mkdir
      }
      console.error(`⚠️  Candado huérfano apartado en ${aside}: ${describe(holder)}`)
    }
  }
  console.error('🔒 No se pudo tomar el candado: otra sesión lo retomó a la vez.')
  process.exit(75)
}

function release(holder) {
  const current = readHolder()
  if (current && current.pid === holder.pid) rmSync(LOCK_DIR, { recursive: true, force: true })
}

function assertLocalEnv() {
  for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_DB_URL', 'DATABASE_URL']) {
    const value = process.env[key]
    if (!value) continue
    const host = new URL(value).hostname
    if (host !== '127.0.0.1' && host !== 'localhost') {
      console.error(`🚨 ${key} apunta a ${host}. Este candado solo protege la base local; no sigo.`)
      process.exit(78)
    }
  }
}

// Cada paso es una línea de shell: en Windows `pnpm` y `supabase` son shims
// `.cmd` que solo resuelve la shell, y pasarle argumentos sueltos con
// `shell: true` los concatena sin comillas (DEP0190).
function runStep(holder, command) {
  return new Promise((resolve) => {
    console.error(`\n▶ ${command}`)
    const child = spawn(command, { stdio: 'inherit', shell: true })
    holder.children.push(child.pid)
    writeHolder(holder)
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    child.on('error', (error) => {
      console.error(error.message)
      resolve(1)
    })
  })
}

async function runUnderLock(command, steps) {
  assertLocalEnv()
  const holder = acquire(command)
  const onSignal = () => {
    release(holder)
    process.exit(130)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let code = 0
  try {
    for (const step of steps) {
      code = await runStep(holder, step)
      if (code !== 0) break
    }
  } finally {
    release(holder)
  }
  process.exit(code)
}

const [verb, ...rest] = process.argv.slice(2)

if (verb === 'status') {
  const holder = readHolder()
  if (!holder) console.log('🔓 Libre.')
  else console.log(`${isOrphan(holder) ? '⚠️  Huérfano' : '🔒 Ocupado'}: ${describe(holder)}`)
} else if (verb === 'cycle') {
  await runUnderLock('cycle', [
    'supabase db reset',
    'pnpm db:seed:e2e',
    'pnpm turbo run test --filter=@tindivo/api --force',
  ])
} else if (verb === 'run' && rest[0] === '--' && rest.length > 1) {
  const command = rest.slice(1).join(' ')
  await runUnderLock(command, [command])
} else {
  console.error('Uso: node scripts/db-lock.mjs cycle | run -- "<comando>" | status')
  process.exit(64)
}
