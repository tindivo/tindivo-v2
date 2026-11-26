import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./codex-audit-scope-check.mjs', import.meta.url))
const ROOT = 'D:\\Copia Auditoria\\audit-root'
const tmp = mkdtempSync(join(tmpdir(), 'scope-check-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

const PS = '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command '
// Codex serializa el argv con comillas POSIX: el cuerpo viaja entre '…' y cada ' interna sale como '"'"'.
const quote = (body) => `'${body.replaceAll("'", `'"'"'`)}'`
const ps = (body) => `${PS}${quote(body)}`

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
    [
      'hermana con ; entre comillas simples',
      ps("Get-Content 'D:\\Copia Auditoria\\audit-root;x\\probe.txt'"),
    ],
    [
      'hermana con ) entre comillas dobles',
      'cmd /c type "D:\\Copia Auditoria\\audit-root)x\\probe.txt"',
    ],
    [
      'hermana con | entre comillas',
      ps("Get-Content 'D:\\Copia Auditoria\\audit-root|x\\probe.txt'"),
    ],
    [
      "hermana con ' entre comillas dobles",
      `cmd /c type "D:\\Copia Auditoria\\audit-root'x\\probe.txt"`,
    ],
    [
      'raíz sola entre comillas (falso positivo aceptado)',
      ps("Get-ChildItem 'D:\\Copia Auditoria\\audit-root'"),
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
    ['raíz con barra final', 'cmd /c dir "D:\\Copia Auditoria\\audit-root\\\\"'],
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

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const raw = String.raw
const reconnecting = { type: 'error', message: 'Reconnecting... 2/5 (request timed out)' }
const fallback = {
  type: 'item.completed',
  item: {
    id: 'item_0',
    type: 'error',
    message: 'Falling back from WebSockets to HTTPS transport.',
  },
}

describe('comillas POSIX del argv de Codex', () => {
  for (const [name, file] of [
    ['R1 de #196 (item_2 e item_5: escapes de regex)', 'r1-196.events.jsonl'],
    ['R2 de #196 (item_3 e item_4: escapes de regex)', 'r2-196.events.jsonl'],
    ['reconexión antes del turno (#229)', 'reconexion-229.events.jsonl'],
  ])
    test(`${name} → 0`, () => {
      const r = run(fixture(file))
      assert.equal(r.status, 0, r.out)
    })
  test('fallo de transporte (#229, intento 1) → 1', () => {
    assert.equal(run(fixture('fallo-transporte-229.events.jsonl')).status, 1)
  })

  const bad = [
    ['UNC entre comillas dobles', raw`cmd /c type "\\\\srv\\share"`],
    ['UNC entre comillas simples', raw`cmd /c type '\\srv\share'`],
    ['unidad ajena con \\ dobles', raw`cmd /c type "D:\\\\otra\\\\x"`],
    ['nombre sensible partido con comillas', "cmd /c type au'th'.json"],
    ['comilla simple sin cerrar', "cmd /c type 'abc"],
    ['comilla doble sin cerrar', 'cmd /c type "abc'],
    ['barra suelta fuera de comillas', raw`cmd /c type D\:\x`],
    ['barra final escapa la comilla de cierre', raw`cmd /c dir "D:\x\"`],
    ['.. armado con barras fuera de comillas', raw`cmd /c type .\.\x`],
  ]
  for (const [name, command] of bad)
    test(`${name} → 1`, () => {
      const r = run(withCmd(command))
      assert.equal(r.status, 1, r.out)
    })

  test('ruta absoluta interna con \\\\ entre comillas dobles → 0', () => {
    const command = raw`cmd /c type "D:\\Copia Auditoria\\audit-root\\Docs\\x.txt"`
    const r = run(withCmd(command))
    assert.equal(r.status, 0, r.out)
  })
  test('escapes de regex dentro de comillas → 0', () => {
    const r = run(withCmd(ps(raw`rg -n 'Jr\.|\A(?:x)\z' a.xml; $p = ' \*'`)))
    assert.equal(r.status, 0, r.out)
  })
  test('UNC real dentro del cuerpo de PowerShell → 1', () => {
    assert.equal(run(withCmd(ps(raw`Get-Content \\srv\share\x`))).status, 1)
  })

  describe('reconexión', () => {
    const c = ps('Get-Content MANIFEST.sha256')
    const body = [cmd(c), cmd(c, 'item.completed')]
    const unknown = { type: 'error', message: 'workspace routing discovery failed' }
    test('Reconnecting y Falling back antes del primer comando → 0', () => {
      const r = run(jl(started, reconnecting, fallback, ...body, done))
      assert.equal(r.status, 0, r.out)
    })
    test('evento error desconocido → 1', () => {
      assert.equal(run(jl(started, unknown, ...body, done)).status, 1)
    })
    test('item error desconocido → 1', () => {
      const e = { type: 'item.completed', item: { id: 'i0', type: 'error', message: 'otra cosa' } }
      assert.equal(run(jl(started, e, ...body, done)).status, 1)
    })
    test('Reconnecting después de un comando → 1', () => {
      assert.equal(run(jl(started, ...body, reconnecting, done)).status, 1)
    })
    test('Falling back después de un comando → 1', () => {
      assert.equal(run(jl(started, ...body, fallback, done)).status, 1)
    })
    test('turn.failed tras reconectar → 1', () => {
      assert.equal(run(jl(started, reconnecting, ...body, done, { type: 'turn.failed' })).status, 1)
    })
    test('reconexión sin turn.completed → 1', () => {
      assert.equal(run(jl(started, reconnecting, ...body)).status, 1)
    })
    test('error final tras reconectar → 1', () => {
      assert.equal(run(jl(started, reconnecting, ...body, done, unknown)).status, 1)
    })
    const withMessage = (event, message) => ({
      ...event,
      ...(event.item ? { item: { ...event.item, message } } : { message }),
    })
    for (const [name, event, message] of [
      ['Reconnecting con cola ajena', reconnecting, 'Reconnecting... 1/5 then I read auth.json'],
      ['Reconnecting con message array', reconnecting, ['Reconnecting... 1/5']],
      ['Falling back con cola de comando', fallback, 'Falling back from WebSockets; ran C:/x'],
      [
        'Falling back con message array',
        fallback,
        ['Falling back from WebSockets to HTTPS transport.'],
      ],
    ])
      test(`${name} → 1`, () => {
        assert.equal(run(jl(started, withMessage(event, message), ...body, done)).status, 1)
      })
    test('Reconnecting 10/10 → 0', () => {
      const e = withMessage(reconnecting, 'Reconnecting... 10/10 (request timed out)')
      assert.equal(run(jl(started, e, ...body, done)).status, 0)
    })
    test('Falling back solo vale como item.completed → 1', () => {
      const e = { ...fallback, type: 'item.started' }
      assert.equal(run(jl(started, e, ...body, done)).status, 1)
    })
  })

  describe('escapes de PowerShell y separadores (revisión ajena)', () => {
    const BS = String.fromCharCode(92)
    const BT = String.fromCharCode(96)
    const ps2 = (script) => `${PS}"${script.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    for (const [name, script] of [
      ['acento grave arma UNC', `Get-Content ${BS}${BT}${BS}server${BS}share${BS}x; 'a'`],
      ['acento grave arma unidad', `Get-Content C${BT}:${BS}Windows${BS}win.ini; 'a'`],
      ['.. seguido de coma', "Get-ChildItem ..,'x\\y'"],
      ['.. seguido de llave', "& {Get-ChildItem ..}; 'x\\y'"],
      ['~ seguido de coma', "Get-ChildItem ~,'x'"],
    ])
      test(`${name} → 1`, () => {
        assert.equal(run(withCmd(ps2(script))).status, 1)
      })
    for (const [name, script] of [
      ['comillas vacías parten la unidad', "Get-Content C'':/Windows/win.ini"],
      ['comillas parten el proveedor', "Get-ChildItem HK''CU:\\Software"],
      ['comillas intercaladas parten la unidad', "Get-Content C':'\\x"],
      ['comillas parten un nombre sensible', "Get-Content x\\.s''sh\\config"],
      [
        'variable vacía y acento grave arman la unidad',
        `Get-Content $x"C${BT}:${BS}Windows${BS}win.ini"`,
      ],
      ['variable vacía y acento grave arman el proveedor', `Get-ChildItem $x"Env${BT}:"`],
      [
        'variable vacía y acento grave arman el registro',
        `Get-ChildItem $x"HK${BT}CU:${BS}Software"`,
      ],
    ])
      test(`${name} → 1`, () => {
        assert.equal(run(withCmd(ps2(script))).status, 1)
        assert.equal(run(withCmd(ps(script))).status, 1) // con la serialización real de Codex
      })
    for (const [name, script] of [
      ['rg con "clave": entre comillas', `rg -n '"env":' turbo.json`],
      ['Select-String con "function":', `Get-Content package.json | Select-String '"function":'`],
      ['argumento JSON de una letra', `node evidencia/arnes.mjs '{"x":1,"y":2}'`],
      ['rg con "x": 1', `rg -n '"x": 1' evidencia`],
      ['rg con case de una letra', `rg -n "case 'a':" src`],
      ['rg con ternario', `rg -n "?'a':'b'" src`],
    ])
      test(`${name} → 0`, () => {
        assert.equal(run(withCmd(ps2(script))).status, 0)
        assert.equal(run(withCmd(ps(script))).status, 0)
      })
    test('error de reconexión tras turn.completed sin comandos → 1', () => {
      assert.equal(run(jl(started, done, reconnecting)).status, 1)
    })
    test('acento grave inocuo → 0', () => {
      assert.equal(run(withCmd(ps2("Write-Output `n'a'; Get-Content a.txt"))).status, 0)
    })
  })
})
