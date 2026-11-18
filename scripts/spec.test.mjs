import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./spec.mjs', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'spec-test-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

const cab = (o = {}) => {
  const c = {
    id: 'pedidos',
    nombre: 'Pedidos',
    actores: '[CUS, NEG]',
    lineas: '[restaurantes]',
    depende_de: '[]',
    dinero: 'false',
    operaciones: '[createOrder]',
    reglas: '[ADDRESS_MIN]',
    ...o,
  }
  const cod = o.codigo ?? '  web: [apps/customer/**/*.ts]\n  android: []\n  ios: []\n  backend: []'
  const { codigo: _ignorado, ...resto } = c
  return `---\n${Object.entries(resto)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\ncodigo:\n${cod}\n---\n`
}

const cuerpo = (o = {}) =>
  o.cuerpo ??
  `
# Pedidos

## Antes de tocar

Una línea.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-PED-001 | Cuando pide, la app crea. | DECISIONS | ★ |
| NEG-PED-002 | Cuando llega, suena. | DECISIONS | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-PED-01 | Dado x, entonces y. | CUS-PED-001, NEG-PED-002 |
| CA-PED-P1 | Dado z, entonces w. | CUS-PED-001 · NEG-PED-002 |

## Reglas

- La dirección exige referencia: \`ADDRESS_MIN\`.
- Ver [pedidos](../../negocio/pedidos.md).
`

const pantalla = (o = {}) => {
  const c = {
    canvas: '[Pedido]',
    requisitos: '[CUS-PED-001]',
    operaciones: '[createOrder]',
    textos: '[]',
    tokens: '[]',
    ...o,
  }
  return `---\n${Object.entries(c)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\ncodigo:\n  web: [apps/customer/**/*.ts]\n  android: []\n  ios: []\n---\n\n# Pantalla\n`
}

const base = () => ({
  'packages/contracts/openapi/v1.json': JSON.stringify({
    paths: { '/orders': { post: { operationId: 'createOrder' }, parameters: [] } },
  }),
  'packages/contracts/src/limites.ts': 'export const ADDRESS_MIN = 3\nexport function calcular() {}\n',
  'supabase/migrations/0001_x.sql': "insert into app_settings values ('prepay_threshold', 1);\n",
  'apps/customer/src/pedido.ts': 'export {}\n',
  'Docs/negocio/pedidos.md': '# Pedidos\n',
  'Docs/producto/pedidos/capacidad.md': cab() + cuerpo(),
  'Docs/producto/pedidos/pantallas/crear.md': pantalla(),
})

let seq = 0
/** Crea un repo temporal con los archivos, corre el script y devuelve { status, out, dir }. */
function run(files, args = ['validar']) {
  const dir = join(tmp, `repo-${seq++}`)
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: dir })
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), c)
  }
  execFileSync('git', ['add', '-A'], { cwd: dir })
  return { ...exec(dir, args), dir }
}
function exec(dir, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}
const con = (cambios) => ({ ...base(), ...cambios })
const falla = (files, trozo, args) => {
  const r = run(files, args)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, trozo)
  return r
}
const CAP = 'Docs/producto/pedidos/capacidad.md'
const PANT = 'Docs/producto/pedidos/pantallas/crear.md'

describe('caso feliz', () => {
  test('pasa y cuenta', () => {
    const r = run(base())
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /✔ spec:validar — 1 capacidades, 1 pantallas, 2 requisitos, 2 criterios/)
  })
  test('cero capacidades es OK', () => {
    const r = run({ 'Docs/producto/_plantilla/capacidad.md': '---\nroto\n---\n' })
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /0 capacidades, 0 pantallas, 0 requisitos, 0 criterios/)
  })
  test('la plantilla se ignora aunque esté rota', () => {
    const r = run(con({ 'Docs/producto/_plantilla/capacidad.md': '---\nroto\n---\n✅ x.ts:3' }))
    assert.equal(r.status, 0, r.out)
  })
})

describe('parser de cabecera', () => {
  test('listas vacías y anidación de codigo', () => {
    const r = run(
      con({
        [CAP]: cab({
          operaciones: '[]',
          reglas: '[]',
          codigo: '  web: []\n  android: []\n  ios: []\n  backend: []',
        }) + cuerpo().replace(/## Reglas[\s\S]*$/, ''),
      }),
    )
    assert.equal(r.status, 0, r.out)
  })
  test('línea inválida: error con archivo y línea', () => {
    falla(
      con({ [CAP]: cab().replace('dinero: false', 'dinero false') + cuerpo() }),
      /capacidad\.md:\d+ · cabecera no válida: forma no admitida/,
    )
  })
  test('valor que no es lista donde se espera', () => {
    falla(con({ [CAP]: cab({ actores: 'CUS' }) + cuerpo() }), /«actores» debe ser una lista/)
  })
  test('sin cabecera', () => {
    falla(con({ [CAP]: '# nada\n' }), /cabecera no válida: el archivo debe empezar con ---/)
  })
  test('clave anidada desconocida', () => {
    falla(
      con({ [CAP]: cab({ codigo: '  desktop: []' }) + cuerpo() }),
      /clave anidada desconocida/,
    )
  })
})

describe('1 · cabecera', () => {
  test('falta clave obligatoria', () => {
    falla(
      con({ [CAP]: cab().replace('nombre: Pedidos\n', '') + cuerpo() }),
      /falta la clave obligatoria «nombre»/,
    )
  })
  test('id distinto de la carpeta', () => {
    falla(con({ [CAP]: cab({ id: 'otra' }) + cuerpo() }), /distinto de la carpeta/)
  })
  test('id con forma inválida', () => {
    falla(con({ [CAP]: cab({ id: 'Pedidos_1' }) + cuerpo() }), /no cumple/)
  })
  test('actor fuera del conjunto', () => {
    falla(con({ [CAP]: cab({ actores: '[CUS, XYZ]' }) + cuerpo() }), /actor «XYZ»/)
  })
  test('pantalla sin clave obligatoria', () => {
    falla(con({ [PANT]: pantalla().replace('tokens: []\n', '') }), /falta la clave obligatoria «tokens»/)
  })
})

describe('2 · IDs', () => {
  test('ID duplicado en dos capacidades, con las dos ubicaciones', () => {
    const otra = cab({ id: 'otra', operaciones: '[]', reglas: '[]' }) + cuerpo()
    const r = falla(con({ 'Docs/producto/otra/capacidad.md': otra }), /ya está definido en/)
    assert.match(r.out, /«CUS-PED-001» ya está definido en Docs\/producto\/otra\/capacidad\.md:\d+/)
    assert.match(r.out, /Docs\/producto\/pedidos\/capacidad\.md:\d+ · «CUS-PED-001»/)
  })
  test('celda parecida a un ID pero mal formada', () => {
    falla(
      con({ [CAP]: cab() + cuerpo().replace('NEG-PED-002 | Cuando', 'CUS-ADR-12 | Cuando') }),
      /ID de requisito no válido: «CUS-ADR-12»/,
    )
  })
  test('criterio mal formado', () => {
    falla(con({ [CAP]: cab() + cuerpo().replace('CA-PED-01', 'CA-PED-1') }), /ID de criterio no válido: «CA-PED-1»/)
  })
})

describe('3 · requisitos de la pantalla (sin rangos)', () => {
  test('requisito no definido', () => {
    falla(con({ [PANT]: pantalla({ requisitos: '[CUS-PED-099]' }) }), /«CUS-PED-099» no está definido/)
  })
  for (const malo of ['002', '001…003', 'CUS-PED-001-003']) {
    test(`regresión de rangos: «${malo}» es ID incompleto`, () => {
      falla(con({ [PANT]: pantalla({ requisitos: `[${malo}]` }) }), /ID incompleto/)
    })
  }
})

describe('4 · requisitos en la tabla de criterios', () => {
  test('requisito no definido', () => {
    falla(con({ [CAP]: cab() + cuerpo().replace('CUS-PED-001, NEG-PED-002', 'CUS-PED-001, NEG-PED-009') }), /«NEG-PED-009» no está definido/)
  })
  test('abreviatura en la celda', () => {
    falla(con({ [CAP]: cab() + cuerpo().replace('CUS-PED-001, NEG-PED-002', '001') }), /ID incompleto: «001»/)
  })
})

describe('5 · depende_de', () => {
  const sin = (id, deps) =>
    cab({ id, depende_de: `[${deps}]`, operaciones: '[]', reglas: '[]' }) + '\n# x\n'
  test('capacidad inexistente', () => {
    falla(con({ [CAP]: cab({ depende_de: '[fantasma]' }) + cuerpo() }), /depende_de «fantasma»/)
  })
  test('ciclo de dos', () => {
    falla(
      con({
        'Docs/producto/a/capacidad.md': sin('a', 'b'),
        'Docs/producto/b/capacidad.md': sin('b', 'a'),
      }),
      /ciclo de dependencias: a → b → a/,
    )
  })
  test('ciclo de tres nodos', () => {
    falla(
      con({
        'Docs/producto/a/capacidad.md': sin('a', 'b'),
        'Docs/producto/b/capacidad.md': sin('b', 'c'),
        'Docs/producto/c/capacidad.md': sin('c', 'a'),
      }),
      /ciclo de dependencias: a → b → c → a/,
    )
  })
  test('dependencia válida sin ciclo', () => {
    const r = run(
      con({
        'Docs/producto/a/capacidad.md': sin('a', 'b'),
        'Docs/producto/b/capacidad.md': sin('b', ''),
      }),
    )
    assert.equal(r.status, 0, r.out)
  })
})

describe('6 · operaciones', () => {
  test('operationId inexistente en la capacidad', () => {
    falla(con({ [CAP]: cab({ operaciones: '[noExiste]' }) + cuerpo() }), /operationId «noExiste»/)
  })
  test('operationId inexistente en la pantalla', () => {
    falla(con({ [PANT]: pantalla({ operaciones: '[otraMas]' }) }), /operationId «otraMas»/)
  })
})

describe('7 · codigo (globs)', () => {
  test('glob sin archivos', () => {
    falla(
      con({ [CAP]: cab({ codigo: '  web: [apps/nada/**/*.ts]' }) + cuerpo() }),
      /el glob no encuentra archivos: apps\/nada/,
    )
  })
  test('glob de pantalla sin archivos', () => {
    falla(con({ [PANT]: pantalla().replace('apps/customer/**/*.ts', 'apps/zzz/*.kt') }), /el glob no encuentra archivos: apps\/zzz/)
  })
  test('`*` no cruza carpetas, `**` sí, `?` es un carácter', () => {
    const f = con({ 'apps/customer/a/b/c.ts': '', 'apps/customer/src/x1.ts': '' })
    const bien = (g) => run({ ...f, [CAP]: cab({ codigo: `  web: [${g}]` }) + cuerpo() }).status
    assert.equal(bien('apps/customer/**/c.ts'), 0)
    assert.equal(bien('apps/customer/src/x?.ts'), 0)
    assert.equal(bien('apps/customer/*/*.ts'), 0)
    assert.equal(bien('apps/customer/*/c.ts'), 1)
    assert.equal(bien('apps/customer/src/x??.ts'), 1)
  })
})

describe('8 · reglas de la cabecera', () => {
  test('app_settings existente pasa', () => {
    const r = run(con({ [CAP]: cab({ reglas: '[app_settings:prepay_threshold, ADDRESS_MIN]' }) + cuerpo().replace('`ADDRESS_MIN`', '`app_settings:prepay_threshold`') }))
    assert.equal(r.status, 0, r.out)
  })
  test('app_settings sin la clave en migraciones', () => {
    falla(con({ [CAP]: cab({ reglas: '[app_settings:no_esta]' }) + cuerpo() }), /regla «app_settings:no_esta»/)
  })
  test('símbolo que no se exporta', () => {
    falla(con({ [CAP]: cab({ reglas: '[NO_EXISTE]' }) + cuerpo() }), /regla «NO_EXISTE»/)
  })
  test('símbolo exportado con function', () => {
    const r = run(con({ [CAP]: cab({ reglas: '[calcular]' }) + cuerpo().replace('`ADDRESS_MIN`', '`calcular`') }))
    assert.equal(r.status, 0, r.out)
  })
})

describe('9 · sección Reglas solo cita', () => {
  const reglas = (texto) => con({ [CAP]: cab() + cuerpo().replace(/## Reglas[\s\S]*$/, `## Reglas\n\n${texto}\n`) })
  const frase = /la sección Reglas solo cita; el valor vive en su casa/
  test('cita por símbolo y por enlace pasa', () => {
    assert.equal(run(reglas('- Pide referencia: `ADDRESS_MIN`.\n- Ver [negocio](../../negocio/pedidos.md).')).status, 0)
  })
  test('un número escrito a mano', () => {
    falla(reglas('- La dirección pide 3 letras: `ADDRESS_MIN`.'), frase)
  })
  test('sin referencia que resuelva', () => {
    falla(reglas('- Pide referencia siempre.'), frase)
  })
  test('símbolo que no está en la cabecera', () => {
    falla(reglas('- Algo: `OTRO`.'), frase)
  })
  test('enlace a un archivo que no existe', () => {
    falla(reglas('- Ver [x](../../negocio/nada.md).'), frase)
  })
  test('línea que no es ítem de lista', () => {
    falla(reglas('Pide referencia `ADDRESS_MIN`.'), frase)
  })
  test('el número dentro de código o de un enlace no cuenta', () => {
    assert.equal(run(reglas('- Ver [guía 2](../../negocio/pedidos.md) y `ADDRESS_MIN`.')).status, 0)
  })
})

describe('10 · Antes de tocar', () => {
  const lineas = (n) => Array.from({ length: n }, (_, i) => `Línea ${i}`).join('\n')
  const con15 = (n) => con({ [CAP]: cab() + cuerpo().replace('Una línea.', lineas(n)) })
  test('15 líneas pasa', () => assert.equal(run(con15(15)).status, 0))
  test('16 líneas falla', () => {
    falla(con15(16), /«Antes de tocar» tiene 16 líneas/)
  })
  test('los comentarios no cuentan', () => {
    const c = cuerpo().replace('Una línea.', `<!--\n${lineas(30)}\n-->\nUna.`)
    assert.equal(run(con({ [CAP]: cab() + c })).status, 0)
  })
})

describe('11 · citas por línea y marcadores', () => {
  const extra = (texto) => con({ [CAP]: cab() + cuerpo().replace('Una línea.', texto) })
  test('cita por línea', () => {
    falla(extra('Mira apps/customer/src/pedido.ts:42.'), /cita por línea prohibida/)
  })
  test('cita por línea en otra pantalla', () => {
    falla(con({ [PANT]: `${pantalla()}\nVer Foo.kt:7\n` }), /cita por línea prohibida/)
  })
  for (const m of ['✅', '🟡', '⚠️', '⬜', '📝']) {
    test(`marcador ${m}`, () => {
      falla(extra(`Estado ${m}`), /marcador de estado manual prohibido/)
    })
  }
  test('dentro de un comentario HTML no cuenta', () => {
    assert.equal(run(extra('<!-- ✅ x.ts:3 -->')).status, 0)
  })
})

describe('12 · alcance por capacidad', () => {
  const otra = () => ({
    'Docs/producto/rota/capacidad.md': cab({ id: 'rota', operaciones: '[noExiste]', reglas: '[]' }) + '\n# x\n',
  })
  test('validar <capacidad> ignora los errores de las demás', () => {
    const r = run(con(otra()), ['validar', 'pedidos'])
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /1 capacidades/)
  })
  test('validar <capacidad> con error propio falla', () => {
    falla(con(otra()), /noExiste/, ['validar', 'rota'])
  })
  test('sin alcance falla por la rota', () => {
    falla(con(otra()), /noExiste/)
  })
  test('capacidad que no existe', () => {
    falla(base(), /no existe en Docs\/producto/, ['validar', 'fantasma'])
  })
  test('los IDs se resuelven contra todas las capacidades', () => {
    const r = run(
      con({
        'Docs/producto/otra/capacidad.md': cab({ id: 'otra', operaciones: '[]', reglas: '[]' }) + '\n# x\n',
        'Docs/producto/otra/pantallas/p.md': pantalla({ requisitos: '[CUS-PED-001]', operaciones: '[]' }),
      }),
      ['validar', 'otra'],
    )
    assert.equal(r.status, 0, r.out)
  })
})

describe('--aviso', () => {
  test('convierte los errores en avisos con exit 0', () => {
    const r = run(con({ [PANT]: pantalla({ requisitos: '[002]' }) }), ['validar', '--aviso'])
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /⚠ spec:validar — 1 aviso\(s\)/)
    assert.match(r.out, /ID incompleto/)
  })
})

describe('indice', () => {
  test('sin capacidades', () => {
    const r = run({ 'Docs/producto/_plantilla/capacidad.md': '' }, ['indice'])
    assert.equal(r.status, 0, r.out)
    const t = readFileSync(join(r.dir, 'Docs/producto/README.md'), 'utf8')
    assert.match(t, /Todavía no hay capacidades migradas\./)
    assert.match(t.split('\n').slice(0, 12).join('\n'), /^> Verificado: generado por pnpm spec:indice$/m)
  })
  test('tablas, orden por id y determinismo', () => {
    const otra = cab({ id: 'aaa', lineas: '[entregas, restaurantes]', actores: '[MOT]', operaciones: '[]', reglas: '[]', dinero: 'true' }) + '\n# x\n'
    const r = run(con({ 'Docs/producto/aaa/capacidad.md': otra }), ['indice'])
    assert.equal(r.status, 0, r.out)
    const leer1 = readFileSync(join(r.dir, 'Docs/producto/README.md'), 'utf8')
    const lineas = leer1.split('\n')
    const iAaa = lineas.findIndex((l) => l.startsWith('| [aaa]'))
    const iPed = lineas.findIndex((l) => l.startsWith('| [pedidos]'))
    assert.ok(iAaa > 0 && iAaa < iPed, 'ordenado por id')
    assert.match(lineas[iPed], /\| \[pedidos\]\(pedidos\/capacidad\.md\) \| Pedidos \| CUS, NEG \| restaurantes \| — \| no \| 1 \| 2 \| 2 \|/)
    assert.match(lineas[iAaa], /\| sí \| 0 \| 0 \| 0 \|/)
    assert.ok(lineas.includes('| Línea | aaa | pedidos |'))
    assert.ok(lineas.includes('| entregas | ● |  |'))
    assert.ok(lineas.includes('| restaurantes | ● | ● |'))
    assert.ok(!/\r/.test(leer1) && leer1.endsWith('\n'))
    exec(r.dir, ['indice'])
    assert.equal(readFileSync(join(r.dir, 'Docs/producto/README.md'), 'utf8'), leer1)
  })
  test('--check: al día pasa; editado o ausente falla y avisa', () => {
    const r = run(base(), ['indice'])
    assert.equal(exec(r.dir, ['indice', '--check']).status, 0)
    writeFileSync(join(r.dir, 'Docs/producto/README.md'), `${readFileSync(join(r.dir, 'Docs/producto/README.md'), 'utf8')}\nedición a mano\n`)
    const mal = exec(r.dir, ['indice', '--check'])
    assert.equal(mal.status, 1)
    assert.match(mal.out, /ejecuta pnpm spec:indice/)
    rmSync(join(r.dir, 'Docs/producto/README.md'))
    assert.equal(exec(r.dir, ['indice', '--check']).status, 1)
  })
  test('no escribe a través de un enlace simbólico (CAX-001)', (t) => {
    const r = run(base(), ['indice', '--check'])
    const fuera = join(tmp, `fuera-${Date.now()}.txt`)
    writeFileSync(fuera, 'intacto\n')
    try {
      symlinkSync(fuera, join(r.dir, 'Docs/producto/README.md'), 'file')
    } catch (e) {
      t.skip(`este sistema no deja crear enlaces simbólicos: ${e.code}`)
      return
    }
    const mal = exec(r.dir, ['indice'])
    assert.equal(mal.status, 1)
    assert.match(mal.out, /enlace simbólico/)
    assert.equal(readFileSync(fuera, 'utf8'), 'intacto\n')
  })
  test('no escribe si un directorio padre es un enlace simbólico (CAX-001)', (t) => {
    const r = run(base(), ['indice', '--check'])
    // Docs/producto pasa a ser un enlace a una carpeta de fuera que ya tiene un README.md propio.
    const fuera = join(tmp, `fuera-dir-${Date.now()}`)
    cpSync(join(r.dir, 'Docs/producto'), fuera, { recursive: true })
    writeFileSync(join(fuera, 'README.md'), 'intacto\n')
    rmSync(join(r.dir, 'Docs/producto'), { recursive: true, force: true })
    try {
      symlinkSync(fuera, join(r.dir, 'Docs/producto'), 'junction')
    } catch (e) {
      t.skip(`este sistema no deja crear enlaces de carpeta: ${e.code}`)
      return
    }
    const mal = exec(r.dir, ['indice'])
    assert.equal(mal.status, 1)
    assert.match(mal.out, /Docs\/producto es un enlace simbólico/)
    assert.equal(readFileSync(join(fuera, 'README.md'), 'utf8'), 'intacto\n')
  })
  test('--check no escribe', () => {
    const r = run(base(), ['indice', '--check'])
    assert.equal(r.status, 1)
    assert.throws(() => readFileSync(join(r.dir, 'Docs/producto/README.md')))
  })
})

describe('traza', () => {
  const conTests = () =>
    con({
      'apps/api/app/api/v1/orders/route.ts': 'export {}\n',
      'apps/customer/src/pedido.test.ts': "test('CA-PED-01 y CA-PED-P1', () => {})\n",
      'apps/android/customer/src/test/kotlin/PedidoTest.kt': '// CA-PED-01\nfun t() {}\n',
      'packages/core/lib/otro.test.ts': '// CA-PED-010 no cuenta\n',
      'apps/customer/src/pedido.ts': '// CA-PED-P1 en un archivo que no es test\nexport {}\n',
    })
  const json = (files) => {
    const r = run(files, ['traza', 'pedidos', '--json'])
    return { ...r, t: r.status === 0 ? JSON.parse(r.out) : null }
  }

  test('estados ✅/🟡/⬜ y archivo:línea por plataforma', () => {
    const r = json(conTests())
    assert.equal(r.status, 0, r.out)
    const ca = Object.fromEntries(r.t.ca.map((c) => [c.id, c]))
    assert.deepEqual(ca['CA-PED-01'].tests.web, ['apps/customer/src/pedido.test.ts:1'])
    assert.deepEqual(ca['CA-PED-01'].tests.android, ['apps/android/customer/src/test/kotlin/PedidoTest.kt:1'])
    assert.equal(ca['CA-PED-P1'].tests.android, undefined)
    assert.equal(ca['CA-PED-P1'].tests.web.length, 1)
    for (const q of r.t.requisitos) {
      assert.equal(q.estado.web, '✅', q.id)
      assert.equal(q.estado.android, '🟡', q.id)
      assert.equal(q.estado.backend, '⬜', q.id)
      assert.equal(q.estado.ios, '—', q.id)
    }
  })
  test('ios con código declarado y sin test es ⬜; texto legible', () => {
    const files = conTests()
    files[CAP] = cab({ codigo: '  web: [apps/customer/**/*.ts]\n  android: []\n  ios: [apps/ios/**]\n  backend: []' }) + cuerpo()
    const r = run(files, ['traza', 'pedidos'])
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /CA-PED-01[^\n]*\n {2}web\s+apps\/customer\/src\/pedido\.test\.ts:1/)
    assert.match(r.out, /\| CUS-PED-001 \| ★ \| CA-PED-01, CA-PED-P1 \| ✅ \| 🟡 \| ⬜ \| ⬜ \|/)
  })
  test('requisito sin CA es ⬜; CA sin test y ★ sin test salen como aviso', () => {
    const files = conTests()
    files[CAP] =
      cab() +
      cuerpo({
        cuerpo: cuerpo().replace('| CA-PED-P1 | Dado z, entonces w. | CUS-PED-001 · NEG-PED-002 |', '| CA-PED-P2 | Dado q. | CUS-PED-001 |'),
      })
    const r = json(files)
    assert.equal(r.status, 0, r.out)
    assert.ok(r.t.avisos.some((a) => /CA-PED-P2 no tiene ningún test/.test(a)))
    assert.equal(r.t.requisitos.find((q) => q.id === 'CUS-PED-001').estado.web, '🟡')
    assert.equal(r.t.requisitos.find((q) => q.id === 'NEG-PED-002').estado.web, '✅')
  })
  test('operationId con route.ts: ruta y archivo; con {id} usa [id]', () => {
    const files = conTests()
    files['packages/contracts/openapi/v1.json'] = JSON.stringify({
      paths: { '/orders': { post: { operationId: 'createOrder' } }, '/orders/{id}': { get: { operationId: 'getOrder' } } },
    })
    files['apps/api/app/api/v1/orders/[id]/route.ts'] = 'export {}\n'
    files[CAP] = cab({ operaciones: '[createOrder, getOrder]' }) + cuerpo()
    const r = json(files)
    assert.equal(r.status, 0, r.out)
    assert.deepEqual(r.t.operaciones.map((o) => [o.id, o.archivo, o.existe]), [
      ['createOrder', 'apps/api/app/api/v1/orders/route.ts', true],
      ['getOrder', 'apps/api/app/api/v1/orders/[id]/route.ts', true],
    ])
  })
  test('operationId sin route.ts: exit 1', () => {
    const r = run(base(), ['traza', 'pedidos'])
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /✖ createOrder .*NO EXISTE/)
  })
  test('operationId fuera del contrato: exit 1', () => {
    const files = conTests()
    files[CAP] = cab({ operaciones: '[noExiste]' }) + cuerpo()
    const r = run(files, ['traza', 'pedidos'])
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /noExiste/)
  })
  test('globs: cuenta archivos rastreados', () => {
    const r = json(conTests())
    const g = r.t.globs.find((x) => x.file === CAP && x.plataforma === 'web')
    assert.ok(g.archivos >= 1)
  })
  test('capacidad inexistente: exit 1; uso incorrecto: exit 2; no escribe archivos', () => {
    const r = run(base(), ['traza', 'nada'])
    assert.equal(r.status, 1)
    assert.match(r.out, /la capacidad «nada» no existe/)
    assert.equal(exec(r.dir, ['traza']).status, 2)
    assert.equal(exec(r.dir, ['traza', 'pedidos', '--x']).status, 2)
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: r.dir, encoding: 'utf8' }).replace(/^A .*\n/gm, ''), '')
  })
})

test('subcomando desconocido: exit 2', () => {
  assert.equal(run(base(), ['nada']).status, 2)
})

describe('traza: no lee a través de enlaces (CAX-001)', () => {
  let n = 0
  const conTests = () =>
    con({
      'apps/customer/src/pedido.test.ts': "test('CA-PED-01', () => {})\n",
      'apps/api/app/api/v1/orders/route.ts': 'export {}\n',
    })
  /** Árbol del repo (sin .git) como { ruta: contenido|'→enlace' }. */
  const arbol = (dir, rel = '') => {
    const out = {}
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.name === '.git') continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isSymbolicLink()) out[r] = '→enlace'
      else if (e.isDirectory()) Object.assign(out, arbol(dir, r))
      else out[r] = readFileSync(join(dir, r), 'utf8')
    }
    return out
  }
  /** Repo temporal con `files`; luego reemplaza `ruta` por un enlace a `destino` (fuera del repo). */
  const conEnlace = (files, ruta, destino, tipo) => {
    const { dir } = run(files, ['traza', 'nada'])
    rmSync(join(dir, ruta), { recursive: true, force: true })
    symlinkSync(destino, join(dir, ruta), tipo)
    return dir
  }
  const externoArchivo = (contenido) => {
    const f = join(tmp, `externo-${n++}.txt`)
    writeFileSync(f, contenido)
    return f
  }
  const externoCarpeta = (files) => {
    const d = join(tmp, `externo-dir-${n++}`)
    for (const [f, c] of Object.entries(files)) {
      mkdirSync(dirname(join(d, f)), { recursive: true })
      writeFileSync(join(d, f), c)
    }
    return d
  }
  const rechaza = (t, dir, ruta) => {
    const antes = arbol(dir)
    const r = exec(dir, ['traza', 'pedidos'])
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /enlace simbólico/)
    assert.ok(r.out.includes(ruta), `nombra ${ruta}: ${r.out}`)
    assert.doesNotMatch(r.out, /SECRETO-EXTERNO/)
    assert.deepEqual(arbol(dir), antes, 'no escribe archivos')
  }
  /** Enlace de archivo: salta solo si el SO no permite crearlo. */
  const archivoEnlace = (t, files, ruta, contenido) => {
    try {
      return conEnlace(files, ruta, externoArchivo(contenido), 'file')
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES') {
        t.skip(`el SO no permite crear enlaces de archivo (${e.code}): caso no ejercitado`)
        return null
      }
      throw e
    }
  }

  test('caso válido sigue funcionando', () => {
    const r = run(conTests(), ['traza', 'pedidos'])
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /apps\/customer\/src\/pedido\.test\.ts:1/)
  })
  test('archivo de test que es enlace externo: rechazado y no se lee', (t) => {
    const ruta = 'apps/customer/src/pedido.test.ts'
    const dir = archivoEnlace(t, conTests(), ruta, '// SECRETO-EXTERNO CA-PED-P1\n')
    if (dir) rechaza(t, dir, ruta)
  })
  test('capacidad.md enlace externo: rechazado', (t) => {
    const dir = archivoEnlace(t, conTests(), CAP, `SECRETO-EXTERNO\n${cab()}${cuerpo()}`)
    if (dir) rechaza(t, dir, CAP)
  })
  test('pantalla enlace externo: rechazada', (t) => {
    const dir = archivoEnlace(t, conTests(), PANT, `${pantalla()}\nSECRETO-EXTERNO\n`)
    if (dir) rechaza(t, dir, PANT)
  })
  test('openapi/v1.json enlace externo: rechazado', (t) => {
    const f = 'packages/contracts/openapi/v1.json'
    const dir = archivoEnlace(t, conTests(), f, '{"SECRETO-EXTERNO":1,"paths":{}}')
    if (dir) rechaza(t, dir, f)
  })
  test('carpeta Docs/producto como junction a fuera: rechazada', () => {
    const ext = externoCarpeta({
      'pedidos/capacidad.md': `${cab()}${cuerpo()}`,
      'pedidos/pantallas/crear.md': pantalla(),
    })
    const dir = conEnlace(conTests(), 'Docs/producto', ext, 'junction')
    rechaza(null, dir, 'Docs/producto')
  })
  test('carpeta packages/contracts como junction a fuera: rechazada', () => {
    const ext = externoCarpeta({ 'openapi/v1.json': '{"SECRETO-EXTERNO":1,"paths":{}}' })
    const dir = conEnlace(conTests(), 'packages/contracts', ext, 'junction')
    rechaza(null, dir, 'packages/contracts')
  })
  test('carpeta de tests como junction a fuera: rechazada', () => {
    const ext = externoCarpeta({ 'pedido.test.ts': '// SECRETO-EXTERNO CA-PED-P1\n' })
    const dir = conEnlace(conTests(), 'apps/customer/src', ext, 'junction')
    rechaza(null, dir, 'apps/customer/src')
  })
})
