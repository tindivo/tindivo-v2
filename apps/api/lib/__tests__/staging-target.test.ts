import { describe, expect, it } from 'vitest'
import {
  assertOutsideRepo,
  assertStagingTarget,
  PROD_REF,
  STAGING_HOST,
  STAGING_REF,
  stagingSettings,
} from '../../scripts/staging-target.ts'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (payload: unknown) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma`
const OK_URL = `https://${STAGING_HOST}`
const OK_KEY = jwt({ ref: STAGING_REF, role: 'service_role' })

describe('assertStagingTarget', () => {
  it('acepta staging con JWT service_role del mismo ref', () => {
    expect(() => assertStagingTarget(OK_URL, OK_KEY)).not.toThrow()
  })

  it('acepta sb_secret_ si la URL es la de staging', () => {
    expect(() => assertStagingTarget(OK_URL, 'sb_secret_abc123')).not.toThrow()
  })

  it('rechaza la URL de producción y lo dice', () => {
    expect(() => assertStagingTarget(`https://${PROD_REF}.supabase.co`, OK_KEY)).toThrow(
      /PRODUCCIÓN/,
    )
  })

  it('rechaza si el ref de producción aparece en otro sitio de la URL o en la clave', () => {
    expect(() => assertStagingTarget(`${OK_URL}/?x=${PROD_REF}`, OK_KEY)).toThrow(/PRODUCCIÓN/)
    expect(() => assertStagingTarget(OK_URL, `sb_secret_${PROD_REF}`)).toThrow(/PRODUCCIÓN/)
    expect(() => assertStagingTarget(OK_URL, jwt({ ref: PROD_REF, role: 'service_role' }))).toThrow(
      /PRODUCCIÓN/,
    )
  })

  it('rechaza http', () => {
    expect(() => assertStagingTarget(`http://${STAGING_HOST}`, OK_KEY)).toThrow(/https/)
  })

  it('rechaza hosts parecidos', () => {
    expect(() => assertStagingTarget(`https://${STAGING_HOST}.evil.com`, OK_KEY)).toThrow()
    expect(() => assertStagingTarget(`https://evil.com/${STAGING_HOST}`, OK_KEY)).toThrow()
    expect(() => assertStagingTarget(`https://x.${STAGING_HOST}`, OK_KEY)).toThrow()
  })

  it('rechaza un JWT de otro ref', () => {
    expect(() =>
      assertStagingTarget(OK_URL, jwt({ ref: 'otroproyecto', role: 'service_role' })),
    ).toThrow(/staging/)
  })

  it('rechaza un JWT con role anon', () => {
    expect(() => assertStagingTarget(OK_URL, jwt({ ref: STAGING_REF, role: 'anon' }))).toThrow(
      /service_role/,
    )
  })

  it('rechaza basura', () => {
    expect(() => assertStagingTarget('no es url', OK_KEY)).toThrow()
    expect(() => assertStagingTarget(OK_URL, '')).toThrow()
    expect(() => assertStagingTarget(OK_URL, 'basura')).toThrow()
    expect(() => assertStagingTarget(OK_URL, 'a.b.c')).toThrow()
    expect(() => assertStagingTarget(OK_URL, `a.${b64([1, 2])}.c`)).toThrow()
  })

  it('no filtra la clave en los mensajes de error', () => {
    const key = jwt({ ref: 'otro', role: 'service_role' })
    try {
      assertStagingTarget(OK_URL, key)
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(key)
    }
  })
})

describe('assertOutsideRepo', () => {
  const repo = process.platform === 'win32' ? 'C:\\work\\repo' : '/work/repo'
  const sep = process.platform === 'win32' ? '\\' : '/'
  const base = process.platform === 'win32' ? 'C:\\work' : '/work'
  const noGit = () => false

  it('rechaza una ruta dentro del repo', () => {
    expect(() => assertOutsideRepo(`${repo}${sep}scratch${sep}x.md`, repo, noGit)).toThrow(/repo/)
  })

  it('rechaza una ruta dentro de cualquier carpeta con .git', () => {
    const otro = `${base}${sep}otro${sep}sub${sep}x.md`
    expect(() => assertOutsideRepo(otro, repo, (d) => d === `${base}${sep}otro`)).toThrow(/git/)
  })

  it('acepta una ruta fuera sin .git', () => {
    expect(() => assertOutsideRepo(`${base}${sep}secretos${sep}x.md`, repo, noGit)).not.toThrow()
  })

  it('no confunde un hermano con prefijo igual', () => {
    expect(() => assertOutsideRepo(`${repo}-otro${sep}x.md`, repo, noGit)).not.toThrow()
  })
})

describe('stagingSettings', () => {
  it('no contiene push_dispatch', () => {
    const keys = stagingSettings(new Date().toISOString()).map((s) => s.key)
    expect(keys).not.toContain('push_dispatch')
    expect(keys).toEqual(['platform_schedule', 'order_intake_cutoff', 'push_claim_since'])
  })

  it('push_claim_since es la hora que se le pasa', () => {
    const now = '2026-10-22T10:00:00.000Z'
    expect(stagingSettings(now).find((s) => s.key === 'push_claim_since')?.value).toBe(now)
  })
})
