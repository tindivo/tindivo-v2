import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  assertOutsideRepo,
  assertStagingTarget,
  PROD_REF,
  STAGING_HOST,
  STAGING_ORIGIN,
  STAGING_REF,
  stagingSettings,
} from '../../scripts/staging-target.ts'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (payload: unknown) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma`
const sha = (k: string) => createHash('sha256').update(k, 'utf8').digest('hex')
const OK_URL = STAGING_ORIGIN
const OK_KEY = 'clave-de-prueba-que-no-es-real'
const OK_SHA = sha(OK_KEY)

describe('assertStagingTarget', () => {
  it('acepta el origen exacto con la clave cuya huella se espera', () => {
    expect(() => assertStagingTarget(OK_URL, OK_KEY, OK_SHA)).not.toThrow()
  })

  it('acepta una sola barra final', () => {
    expect(() => assertStagingTarget(`${OK_URL}/`, OK_KEY, OK_SHA)).not.toThrow()
  })

  it('rechaza puerto, credenciales, ruta, consulta, fragmento y mayúsculas', () => {
    const malas = [
      `https://${STAGING_HOST}:8443`,
      `https://u:p@${STAGING_HOST}`,
      `${OK_URL}/x`,
      `${OK_URL}?a=1`,
      `${OK_URL}#a`,
      `${OK_URL}//`,
      `https://${STAGING_HOST.toUpperCase()}`,
      `HTTPS://${STAGING_HOST}`,
    ]
    for (const u of malas)
      expect(() => assertStagingTarget(u, OK_KEY, OK_SHA), u).toThrow(/ABORTADO/)
  })

  it('rechaza una clave cuya huella no coincide (JWT inventado, sb_secret_ cualquiera)', () => {
    expect(() =>
      assertStagingTarget(OK_URL, jwt({ ref: STAGING_REF, role: 'service_role' }), OK_SHA),
    ).toThrow(/registrada de staging/)
    expect(() => assertStagingTarget(OK_URL, 'sb_secret_abc123', OK_SHA)).toThrow(
      /registrada de staging/,
    )
    expect(() => assertStagingTarget(OK_URL, 'sb_secret_abc123')).toThrow(/registrada de staging/)
  })

  it('rechaza la URL de producción y lo dice', () => {
    expect(() => assertStagingTarget(`https://${PROD_REF}.supabase.co`, OK_KEY, OK_SHA)).toThrow(
      /PRODUCCIÓN/,
    )
  })

  it('rechaza si el ref de producción aparece en otro sitio de la URL o en la clave', () => {
    expect(() => assertStagingTarget(`${OK_URL}/?x=${PROD_REF}`, OK_KEY, OK_SHA)).toThrow(
      /PRODUCCIÓN/,
    )
    expect(() => assertStagingTarget(OK_URL, `sb_secret_${PROD_REF}`, OK_SHA)).toThrow(/PRODUCCIÓN/)
  })

  it('rechaza http y hosts parecidos', () => {
    expect(() => assertStagingTarget(`http://${STAGING_HOST}`, OK_KEY, OK_SHA)).toThrow()
    expect(() => assertStagingTarget(`https://${STAGING_HOST}.evil.com`, OK_KEY, OK_SHA)).toThrow()
    expect(() => assertStagingTarget(`https://evil.com/${STAGING_HOST}`, OK_KEY, OK_SHA)).toThrow()
    expect(() => assertStagingTarget(`https://x.${STAGING_HOST}`, OK_KEY, OK_SHA)).toThrow()
  })

  it('rechaza basura', () => {
    expect(() => assertStagingTarget('no es url', OK_KEY, OK_SHA)).toThrow()
    expect(() => assertStagingTarget(OK_URL, '', OK_SHA)).toThrow()
    expect(() => assertStagingTarget(OK_URL, 'basura', OK_SHA)).toThrow()
  })

  it('no filtra la clave ni la huella completa en los mensajes de error', () => {
    const key = 'otra-clave-secreta'
    let msg = ''
    try {
      assertStagingTarget(OK_URL, key, OK_SHA)
    } catch (e) {
      msg = String((e as Error).message)
    }
    expect(msg).not.toBe('')
    expect(msg).not.toContain(key)
    expect(msg).not.toContain(sha(key))
    expect(msg).toContain(sha(key).slice(0, 8))
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

  it('trata `..secretos` como una carpeta DENTRO del repo (no como un padre)', () => {
    expect(() => assertOutsideRepo(`${repo}${sep}..secretos${sep}x`, repo, noGit)).toThrow(/repo/)
  })

  it('un hermano del repo está fuera', () => {
    expect(() => assertOutsideRepo(`${base}${sep}otro`, repo, noGit)).not.toThrow()
  })

  it.skipIf(process.platform !== 'win32')(
    'en Windows las mayúsculas del repo cuentan como dentro',
    () => {
      expect(() => assertOutsideRepo(`${repo.toUpperCase()}${sep}x`, repo, noGit)).toThrow(/repo/)
    },
  )

  it('la propia carpeta con .git cuenta', () => {
    const dir = `${base}${sep}otro`
    expect(() => assertOutsideRepo(dir, repo, (d) => d === dir)).toThrow(/git/)
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
