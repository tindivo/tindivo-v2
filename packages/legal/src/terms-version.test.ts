import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadLegalDocument } from './loader'
import { latestAppSetting } from './test-support/app-settings'

describe('versión de los Términos', () => {
  it('coincide con app_settings.terms_version: la app no pide reaceptar una versión que la web no publica', () => {
    expect(loadLegalDocument('terminos').version).toBe(latestAppSetting('terms_version'))
  })
})

describe('umbral de prepago de los Términos', () => {
  it('el «S/N» del texto es el prepay_threshold vigente en la base', () => {
    const text = loadLegalDocument('terminos')
      .sections.flatMap((s) => s.blocks)
      .flatMap((b) => (b.type === 'paragraph' ? [b.text] : b.items))
      .join('\n')
    const written = /supere S\/(\d+(?:\.\d+)?)/.exec(text)?.[1]
    expect(written, 'los Términos deben decir «supere S/N»').toBeDefined()
    expect(Number(written)).toBe(Number(latestAppSetting('prepay_threshold')))
  })
})

describe('latestAppSetting', () => {
  it('toma la última siembra de una clave', () => {
    expect(latestAppSetting('prepay_threshold')).toBe(80)
  })

  it('reconoce también el update y toma la última migración que toque la clave', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tindivo-migrations-'))
    try {
      writeFileSync(
        join(dir, '0001.sql'),
        `insert into app_settings values ('terms_version', '"2026-05"'::jsonb);`,
      )
      writeFileSync(
        join(dir, '0002.sql'),
        `update public.app_settings set value = '"2026-12"'::jsonb, updated_at = now() where key = 'terms_version';`,
      )
      writeFileSync(join(dir, '0003.sql'), `select 1;`)
      expect(latestAppSetting('terms_version', dir)).toBe('2026-12')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
