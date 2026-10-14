/**
 * Candado de la base local: lo que exige quien vaya a borrar o sembrar.
 *
 * Es un test UNITARIO (no toca ninguna base). Cubre el contrato de
 * `scripts/db-lock-guard.mjs` y comprueba, con un proceso hijo real, que
 * importar `local-db.ts` sin candado aborta ANTES de crear el cliente.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assertDbLock,
  CI_BYPASS_ENV,
  CI_BYPASS_VALUE,
  hasValidLock,
  LOCK_REQUIRED_MESSAGE,
  TOKEN_ENV,
} from '../../../../scripts/db-lock-guard.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'tindivo-lock-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function holderFile(holder: Record<string, unknown>): string {
  const path = join(tmp, `holder-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(path, JSON.stringify(holder))
  return path
}

const vivo = { pid: process.pid, children: [], startedAt: 'x', command: 'x', cwd: 'x' }

describe('assertDbLock', () => {
  it('sin token ni señal de CI: se niega con el mensaje claro', () => {
    expect(() => assertDbLock({ env: {}, infoPath: holderFile({ ...vivo, token: 'a' }) })).toThrow(
      LOCK_REQUIRED_MESSAGE,
    )
    expect(LOCK_REQUIRED_MESSAGE).toContain('pnpm db:lock run')
    expect(LOCK_REQUIRED_MESSAGE).toContain('pnpm db:cycle')
  })

  it('con el token del archivo y el pid vivo: pasa', () => {
    const infoPath = holderFile({ ...vivo, token: 'tok-1' })
    expect(() => assertDbLock({ env: { [TOKEN_ENV]: 'tok-1' }, infoPath })).not.toThrow()
  })

  it('con un token que no es el del archivo: se niega', () => {
    const infoPath = holderFile({ ...vivo, token: 'tok-1' })
    expect(hasValidLock({ env: { [TOKEN_ENV]: 'otro' }, infoPath })).toBe(false)
  })

  it('con el token correcto pero sin ningún proceso vivo detrás: se niega', () => {
    const infoPath = holderFile({ ...vivo, pid: 2 ** 22 + 12345, token: 'tok-1' })
    expect(hasValidLock({ env: { [TOKEN_ENV]: 'tok-1' }, infoPath })).toBe(false)
  })

  it('sin archivo de candado: se niega', () => {
    expect(
      hasValidLock({ env: { [TOKEN_ENV]: 'tok-1' }, infoPath: join(tmp, 'no-existe.json') }),
    ).toBe(false)
  })

  it('CI=true más la variable propia del job: pasa sin candado', () => {
    const env = { CI: 'true', [CI_BYPASS_ENV]: CI_BYPASS_VALUE }
    expect(() => assertDbLock({ env, infoPath: join(tmp, 'no-existe.json') })).not.toThrow()
  })

  it('solo CI=true, o solo la variable del job: se niega (no es heurística)', () => {
    const infoPath = join(tmp, 'no-existe.json')
    expect(hasValidLock({ env: { CI: 'true' }, infoPath })).toBe(false)
    expect(hasValidLock({ env: { [CI_BYPASS_ENV]: CI_BYPASS_VALUE }, infoPath })).toBe(false)
  })
})

describe('local-db.ts importado sin candado (proceso hijo real)', () => {
  const localDbUrl = new URL('./helpers/local-db.ts', import.meta.url).href
  const probe = `await import(${JSON.stringify(localDbUrl)}); console.log('IMPORTADO')`

  function run(extra: Record<string, string>) {
    const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
    for (const key of [TOKEN_ENV, CI_BYPASS_ENV, 'CI']) if (!(key in extra)) delete env[key]
    return spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      env,
      encoding: 'utf8',
    })
  }

  it('aborta antes de crear el cliente', () => {
    const r = run({})
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain(LOCK_REQUIRED_MESSAGE)
    expect(r.stdout).not.toContain('IMPORTADO')
  })

  it('con la señal de CI importa normal', () => {
    const r = run({ CI: 'true', [CI_BYPASS_ENV]: CI_BYPASS_VALUE })
    expect(r.stderr).not.toContain(LOCK_REQUIRED_MESSAGE)
    expect(r.stdout).toContain('IMPORTADO')
  })
})
