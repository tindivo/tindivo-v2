import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../scripts/vercel-ignore.sh')

let repo: string

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
}

function commit(file: string, content: string) {
  const path = join(repo, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  git('add', '-A')
  git('commit', '-q', '-m', `cambia ${file}`)
}

function head(): string {
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
}

function runIgnoreStep(previousSha?: string): number | null {
  const env = { ...process.env }
  env.VERCEL_GIT_PREVIOUS_SHA = previousSha
  if (previousSha === undefined) delete env.VERCEL_GIT_PREVIOUS_SHA
  return spawnSync('bash', [SCRIPT], { cwd: repo, encoding: 'utf8', env }).status
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'tindivo-ignore-'))
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  commit('README.md', 'base')
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('Ignored Build Step de tindivo.com (CA-WPU-10)', () => {
  it('no despliega cuando, desde el último despliegue, solo cambia otra app (sale 0)', () => {
    const previous = head()
    commit('apps/negocios/page.tsx', 'x')
    expect(runIgnoreStep(previous)).toBe(0)
  })

  it.each([
    'apps/web/app/page.tsx',
    'packages/legal/content/terminos.md',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'package.json',
    'turbo.json',
    'tsconfig.base.json',
    'packages/tsconfig/base.json',
  ])('despliega cuando cambia %s (sale 1)', (file) => {
    const previous = head()
    commit(file, `cambio ${Math.random()}`)
    expect(runIgnoreStep(previous)).toBe(1)
  })

  it('despliega si apps/web cambió en un commit anterior de un push de varios (sale 1)', () => {
    const previous = head()
    commit('apps/web/app/layout.tsx', 'primero')
    commit('apps/negocios/otra.tsx', 'segundo')
    expect(runIgnoreStep(previous)).toBe(1)
  })

  it('no despliega si en todo el push solo cambió otra app (sale 0)', () => {
    const previous = head()
    commit('apps/negocios/a.tsx', 'a')
    commit('apps/admin/b.tsx', 'b')
    expect(runIgnoreStep(previous)).toBe(0)
  })

  // CAX-001: sin una base del último despliegue en la que confiar, se despliega. Nunca se sustituye por HEAD^, que en un
  // push de varios commits esconde los anteriores (A cambia los legales, B otra app: HEAD^ = A no ve el cambio).
  describe('sin una base válida del último despliegue, despliega (sale 1)', () => {
    let beforePush: string
    beforeAll(() => {
      beforePush = head()
      commit('packages/legal/content/terminos.md', `A ${Math.random()}`)
      commit('apps/negocios/b.tsx', `B ${Math.random()}`)
    })

    it('sin VERCEL_GIT_PREVIOUS_SHA', () => {
      expect(runIgnoreStep()).toBe(1)
    })

    it('con VERCEL_GIT_PREVIOUS_SHA vacío', () => {
      expect(runIgnoreStep('')).toBe(1)
    })

    it('con un VERCEL_GIT_PREVIOUS_SHA que no existe en el clon', () => {
      expect(runIgnoreStep('0123456789abcdef0123456789abcdef01234567')).toBe(1)
    })

    it('con VERCEL_GIT_PREVIOUS_SHA igual a HEAD', () => {
      expect(runIgnoreStep(head())).toBe(1)
    })

    it('con VERCEL_GIT_PREVIOUS_SHA que no es un antecesor de HEAD', () => {
      git('checkout', '-q', '-b', 'lateral', beforePush)
      commit('apps/admin/lateral.tsx', 'lateral')
      const lateral = head()
      git('checkout', '-q', '-')
      expect(runIgnoreStep(lateral)).toBe(1)
    })

    it('con una expresión o un SHA abreviado en vez de un SHA completo', () => {
      expect(runIgnoreStep('HEAD^')).toBe(1)
      expect(runIgnoreStep(beforePush.slice(0, 12))).toBe(1)
    })

    it('con la base válida anterior a A también despliega', () => {
      expect(runIgnoreStep(beforePush)).toBe(1)
    })
  })

  it('despliega si no puede saber qué cambió: sin commit anterior (sale 1)', () => {
    const first = mkdtempSync(join(tmpdir(), 'tindivo-ignore-solo-'))
    try {
      const run = (...args: string[]) => spawnSync('git', args, { cwd: first, encoding: 'utf8' })
      run('init', '-q')
      run('config', 'user.email', 'test@example.com')
      run('config', 'user.name', 'Test')
      run('config', 'commit.gpgsign', 'false')
      writeFileSync(join(first, 'a.txt'), 'a')
      run('add', '-A')
      run('commit', '-q', '-m', 'unico')
      expect(spawnSync('bash', [SCRIPT], { cwd: first }).status).toBe(1)
    } finally {
      rmSync(first, { recursive: true, force: true })
    }
  })
})

describe('vercel.json (CUS-WPU-011)', () => {
  it('enlaza el script como Ignored Build Step y publica `out/`', () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8')) as {
      ignoreCommand: string
      outputDirectory: string
    }
    expect(config.ignoreCommand).toContain('scripts/vercel-ignore.sh')
    expect(config.outputDirectory).toBe('out')
  })
})
