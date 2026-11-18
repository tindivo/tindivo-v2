import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-docs.mjs', import.meta.url))
const plantilla = readFileSync(fileURLToPath(new URL('../Docs/producto/_plantilla/capacidad.md', import.meta.url)), 'utf8')
const tmp = mkdtempSync(join(tmpdir(), 'check-docs-test-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

let seq = 0
function run(files) {
  const dir = join(tmp, `r${seq++}`)
  for (const [ruta, texto] of Object.entries({ 'AGENTS.md': '# Agentes\n', ...files })) {
    mkdirSync(dirname(join(dir, ruta)), { recursive: true })
    writeFileSync(join(dir, ruta), texto)
  }
  const git = (...a) => execFileSync('git', ['-c', 'core.autocrlf=false', ...a], { cwd: dir, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('cabecera de una capacidad de Docs/producto/ (CAX-002)', () => {
  test('una capacidad copiada de la plantilla, con «Verificado» después de los metadatos, pasa', () => {
    assert.ok(plantilla.split('\n').indexOf('> Verificado: AAAA-MM-DD · entorno: develop@abc1234 · Aprobado por Jesús el AAAA-MM-DD (medio)') > 12)
    const r = run({ 'Docs/producto/x/capacidad.md': plantilla })
    assert.equal(r.status, 0, r.out)
  })
  test('sin «Verificado» después de los metadatos, falla', () => {
    const sin = plantilla.replace(/^> Verificado:.*$/m, '')
    const r = run({ 'Docs/producto/x/capacidad.md': sin })
    assert.equal(r.status, 1)
    assert.match(r.out, /Docs\/producto\/x\/capacidad\.md · falta «> Verificado: …»/)
  })
  test('un «Verificado» dentro de los metadatos no cuenta', () => {
    const r = run({ 'Docs/producto/x/capacidad.md': `---\nid: x\n> Verificado: trampa\n---\n\n# X\n` })
    assert.equal(r.status, 1)
  })
  test('el canon sin metadatos sigue exigiendo «Verificado» en las 12 primeras líneas', () => {
    assert.equal(run({ 'Docs/negocio/a.md': '# A\n\n> Verificado: 2026-11-17\n' }).status, 0)
    assert.equal(run({ 'Docs/negocio/a.md': `# A\n${'\n'.repeat(14)}> Verificado: 2026-11-17\n` }).status, 1)
  })
})
