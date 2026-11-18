import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

test('subcomando desconocido: exit 2', () => {
  assert.equal(run(base(), ['nada']).status, 2)
})
