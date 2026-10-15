import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./codex-audit-scope-check.mjs', import.meta.url))
const ROOT = 'D:\\Copia Auditoria\\audit-root'
const tmp = mkdtempSync(join(tmpdir(), 'scope-check-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

const PS = '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '
const ps = (body) => `${PS}'${body}'`

const jl = (...events) => events.map((e) => JSON.stringify(e)).join('\n')
const started = { type: 'thread.started', thread_id: 't1' }
const done = { type: 'turn.completed', usage: {} }
const cmd = (command, type = 'item.started') => ({
  type,
  item: { id: 'item_1', type: 'command_execution', command, status: 'in_progress' },
})
const item = (itemType, type = 'item.started', extra = {}) => ({
  type,
  item: { id: 'item_9', type: itemType, ...extra },
})

let seq = 0
function run(content, root = ROOT) {
  const file = join(tmp, `ev-${seq++}.jsonl`)
  writeFileSync(file, content)
  const r = spawnSync(process.execPath, [script, file, root], { encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}
const withCmd = (command, ...more) =>
  jl(started, cmd(command), cmd(command, 'item.completed'), ...more, done)

describe('marca (exit 1)', () => {
  const bad = [
    ['unidad Z: con /', ps('Get-Content Z:/outside/probe.txt')],
    ['UNC', ps('Get-Content \\\\server\\share\\probe.txt')],
    ['unidad C: sola', ps('Get-ChildItem -Path C:')],
    ['alias gc con z:', ps('gc z:/outside/probe.txt')],
    ['cmd /c sin powershell', 'cmd /c type Z:/outside/probe.txt'],
    ['unidad entre comillas', ps("Get-Content 'z:/outside/probe.txt'")],
    ['auth.json', ps('Get-Content auth.json')],
    ['segmento ..', ps('Get-Content ..\\..\\x.txt')],
    ['$env: y .npmrc', ps('Get-Content $env:USERPROFILE\\.npmrc')],
    ['proveedor HKCU', ps('Get-ChildItem HKCU:\\Software')],
    ['Set-Location D:\\', ps('Set-Location D:\\')],
    ['ruta hermana audit-root2', ps("Get-Content 'D:\\Copia Auditoria\\audit-root2\\x.txt'")],
    [
      'salida con .. desde la raíz',
      ps("Get-Content 'D:\\Copia Auditoria\\audit-root\\..\\fuera.txt'"),
    ],
    ['PowerShell sin -NoProfile', 'powershell.exe -Command "Get-Content MANIFEST.sha256"'],
    ['tilde', ps('Get-Content ~\\x.txt')],
    ['%VAR%', ps('Get-Content %USERPROFILE%\\x.txt')],
    ['$HOME', ps('Get-Content $HOME\\x.txt')],
    ['cd', ps('cd ..; ls')],
  ]
  for (const [name, command] of bad)
    test(name, () => {
      const r = run(withCmd(command))
      assert.equal(r.status, 1, r.out)
    })

  test('item.completed sin started que lee auth.json', () => {
    const r = run(jl(started, cmd(ps('Get-Content auth.json'), 'item.completed'), done))
    assert.equal(r.status, 1, r.out)
  })
  test('item.completed de tipo mcp_tool_call', () => {
    const r = run(
      jl(started, item('mcp_tool_call', 'item.completed', { server: 's', tool: 't' }), done),
    )
    assert.equal(r.status, 1, r.out)
  })
  test('item.started de tipo file_change', () => {
    const r = run(jl(started, item('file_change'), done))
    assert.equal(r.status, 1, r.out)
  })
  for (const [name, command] of [
    [
      'hermana con espacio entre comillas',
      ps("Get-Content 'D:\\Copia Auditoria\\audit-root copia\\probe.txt'"),
    ],
    ['unidad relativa D:probe.txt', ps('Get-Content D:probe.txt')],
    ['unidad relativa Z:probe.txt', ps('Get-Content Z:probe.txt')],
  ])
    test(name, () => assert.equal(run(withCmd(command)).status, 1))
  test('command_execution completed sin command', () => {
    const r = run(
      jl(started, { type: 'item.completed', item: { id: 'i', type: 'command_execution' } }, done),
    )
    assert.equal(r.status, 1, r.out)
  })
  test('actividad después de turn.completed', () => {
    const c = ps('Get-Content MANIFEST.sha256')
    assert.equal(run(jl(started, done, cmd(c), cmd(c, 'item.completed'))).status, 1)
  })
  test('started sin completed aunque haya turn.completed después', () => {
    assert.equal(run(jl(started, cmd(ps('Get-Content MANIFEST.sha256')), done)).status, 1)
  })
  test('JSONL vacío', () => assert.equal(run('').status, 1))
  test('solo thread.started', () => assert.equal(run(jl(started)).status, 1))
  test('sin turn.completed', () => {
    assert.equal(run(jl(started, cmd(ps('Get-Content MANIFEST.sha256')))).status, 1)
  })
  test('con turn.failed', () => {
    const r = run(
      jl(started, cmd(ps('Get-Content MANIFEST.sha256')), done, { type: 'turn.failed' }),
    )
    assert.equal(r.status, 1, r.out)
  })
  test('línea que no es JSON', () => {
    const r = run(`${jl(started, done)}\nesto no es json`)
    assert.equal(r.status, 1, r.out)
  })
  test('archivo inexistente', () => {
    const r = spawnSync(process.execPath, [script, join(tmp, 'no-existe.jsonl'), ROOT], {
      encoding: 'utf8',
    })
    assert.equal(r.status, 1)
  })
  test('sin argumentos sale con 2', () => {
    assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 2)
  })
})

describe('no marca (exit 0)', () => {
  const good = [
    ['ruta relativa', ps('Get-Content Docs/operacion/trampas.md')],
    ['rg en el directorio actual', ps('rg -n "x" .')],
    [
      'interna absoluta con espacios y comillas',
      ps("Get-Content 'D:\\Copia Auditoria\\audit-root\\Docs\\operacion\\trampas.md'"),
    ],
    [
      'interna absoluta con /',
      ps("Get-Content 'D:/Copia Auditoria/audit-root/Docs/operacion/trampas.md'"),
    ],
    ['Get-FileHash', ps('Get-FileHash -Algorithm SHA256 MANIFEST.sha256')],
  ]
  for (const [name, command] of good)
    test(name, () => {
      const r = run(withCmd(command))
      assert.equal(r.status, 0, r.out)
    })

  test('completed sin started con comando interno válido', () => {
    const c = ps("Get-Content 'D:\\Copia Auditoria\\audit-root\\x.txt'")
    assert.equal(run(jl(started, cmd(c, 'item.completed'), done)).status, 0)
  })
  test('agent_message y reasoning junto a comandos permitidos', () => {
    const r = run(
      jl(
        started,
        item('reasoning', 'item.completed', { text: 'pienso' }),
        cmd(ps('Get-Content MANIFEST.sha256')),
        cmd(ps('Get-Content MANIFEST.sha256'), 'item.completed'),
        item('agent_message', 'item.completed', { text: 'listo' }),
        done,
      ),
    )
    assert.equal(r.status, 0, r.out)
  })
})

describe('eventos reales', () => {
  const base = 'D:\\Tinkuy Creativo\\Proyectos\\Tindivo\\Code\\tindivo-auditorias\\2026-10-15-mv3b'
  const root = `${base}\\audit-root`
  for (const [file, expected] of [
    ['02-codex.events.jsonl', 0],
    ['01-codex.events.jsonl', 1],
  ])
    test(`${file} → ${expected}`, (t) => {
      const path = `${base}\\debate\\${file}`
      if (!existsSync(path)) return t.skip('no existe el fixture real')
      const r = spawnSync(process.execPath, [script, path, root], { encoding: 'utf8' })
      assert.equal(r.status, expected, `${r.stdout}${r.stderr}`)
    })
})
