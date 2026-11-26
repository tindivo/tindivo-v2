import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CONFIG = resolve(__dirname, '../vercel.json')

describe('Despliegue de tindivo.com (CA-WPU-10)', () => {
  it('no declara `ignoreCommand`: se despliega en cada push', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as Record<string, unknown>
    expect(config).not.toHaveProperty('ignoreCommand')
  })
})
