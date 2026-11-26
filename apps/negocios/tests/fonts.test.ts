import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = resolve(__dirname, '..')
const layout = readFileSync(join(APP_DIR, 'app/layout.tsx'), 'utf8')

describe('build sin red', () => {
  it('la letra no se descarga de Google en el build (next/font/google)', () => {
    expect(layout).not.toContain('next/font/google')
  })

  it('expone las variables que lee packages/ui (--font-geist y --font-jetbrains)', () => {
    expect(layout).toContain("'--font-geist': 'var(--font-geist-sans)'")
    expect(layout).toContain("variable: '--font-jetbrains'")
  })
})
