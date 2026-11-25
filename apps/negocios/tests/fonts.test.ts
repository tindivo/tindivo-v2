import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = resolve(__dirname, '..')

describe('build sin red', () => {
  it('la letra no se descarga de Google en el build (next/font/google)', () => {
    const layout = readFileSync(join(APP_DIR, 'app/layout.tsx'), 'utf8')
    expect(layout).not.toContain('next/font/google')
  })
})
