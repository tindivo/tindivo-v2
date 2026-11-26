// node --test scripts/e2e-puertos.test.mjs
// La guardia de puertos falla CERRADA: solo el resultado reconocido de «nadie escucha» deja pasar.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { escuchadores, verificarPuertos } from './e2e-puertos.mjs'

// `resolve`: en Windows «/work/…» cuelga de la unidad actual; la guardia compara la ruta ya resuelta.
const RAIZ = resolve('/work/tindivo-v2-mio')
const MIO = `node ${RAIZ}/node_modules/.pnpm/next@16/node_modules/next/dist/server/lib/start-server.js`
const AJENO = `node ${RAIZ}-otro/node_modules/.pnpm/next@16/next/dist/server/lib/start-server.js`

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })

/** `run` falso para Linux: `libres` son los puertos sin dueño; el resto lo tiene `pid` con la línea `linea`. */
function linux({ dueno = {}, lsof, ps } = {}) {
  return (cmd, args) => {
    if (cmd === 'lsof') {
      if (lsof) return lsof
      const puerto = Number(args[1].match(/TCP:(\d+)/)[1])
      return dueno[puerto] ? ok(`${dueno[puerto].pid}\n`) : { status: 1, stdout: '', stderr: '' }
    }
    if (cmd === 'ps') {
      if (ps) return ps
      const pid = Number(args[3])
      const d = Object.values(dueno).find((x) => x.pid === pid)
      return ok(`${d.linea}\n`)
    }
    throw new Error(`comando inesperado ${cmd}`)
  }
}
const opc = (run) => ({ run, plataforma: 'linux' })

test('todos los puertos libres: pasa', () => {
  assert.doesNotThrow(() => verificarPuertos(RAIZ, [3000, 3001], opc(linux())))
})

test('un servidor de ESTE árbol: pasa', () => {
  const run = linux({ dueno: { 3001: { pid: 11, linea: MIO } } })
  assert.doesNotThrow(() => verificarPuertos(RAIZ, [3000, 3001], opc(run)))
})

test('un servidor de OTRO árbol, aunque su ruta empiece igual: aborta nombrando puerto y pid', () => {
  const run = linux({ dueno: { 3003: { pid: 22, linea: AJENO } } })
  assert.throws(() => verificarPuertos(RAIZ, [3003], opc(run)), /:3003 {2}pid 22/)
})

test('lsof ausente: aborta, no da el puerto por libre', () => {
  const run = linux({ lsof: { error: new Error('spawnSync lsof ENOENT'), status: null } })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*ENOENT/)
})

test('lsof con error real (código 2): aborta', () => {
  const run = linux({ lsof: { status: 2, stdout: '', stderr: 'lsof: illegal option' } })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*código 2/)
})

test('lsof sale con 1 pero con mensaje de error: aborta (no es el «nadie escucha» reconocido)', () => {
  const run = linux({ lsof: { status: 1, stdout: '', stderr: 'lsof: WARNING: can not read /proc' } })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar/)
})

test('lsof sale con 0 y salida vacía pero con error estándar: aborta (CAX-003)', () => {
  const run = linux({ lsof: { status: 0, stdout: '', stderr: 'lsof: WARNING: no se pudo leer parte de la tabla' } })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*lsof/)
})

test('lsof sale con 0, con un pid y con error estándar (salida parcial): aborta (CAX-003)', () => {
  const run = linux({
    lsof: { status: 0, stdout: '33\n', stderr: 'lsof: WARNING: can not stat() /mnt/x' },
    ps: ok(`${MIO}\n`),
  })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*lsof/)
})

test('lsof sale con 0, sin pids y sin error: aborta (no es el «libre» reconocido)', () => {
  for (const stdout of ['', '\n']) {
    const run = linux({ lsof: { status: 0, stdout, stderr: '' } })
    assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*lsof/)
  }
})

test('lsof sale con 0 y una línea que no es un pid: aborta', () => {
  const run = linux({ lsof: { status: 0, stdout: 'basura\n', stderr: '' }, ps: ok(`${MIO}\n`) })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*lsof/)
})

test('ps sale con 0 y con error estándar: aborta (CAX-003)', () => {
  const run = linux({
    dueno: { 3000: { pid: 33, linea: MIO } },
    ps: { status: 0, stdout: `${MIO}\n`, stderr: 'ps: aviso' },
  })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*ps/)
})

test('ps falla al leer al dueño: aborta', () => {
  const run = linux({
    dueno: { 3000: { pid: 33, linea: MIO } },
    ps: { status: 1, stdout: '', stderr: 'ps: error' },
  })
  assert.throws(() => verificarPuertos(RAIZ, [3000], opc(run)), /No se pudo comprobar.*ps/)
})

test('Windows: PowerShell que falla aborta; un dueño sin línea de comandos cuenta como ajeno', () => {
  const win = (r) => ({ run: () => r, plataforma: 'win32' })
  assert.throws(() => escuchadores([3000], win({ status: 1, stdout: '', stderr: 'x' })), /PowerShell/)
  assert.throws(
    () => verificarPuertos(RAIZ, [3000], win(ok('3000\t44\t\n'))),
    /:3000 {2}pid 44 {2}\(sin línea de comandos\)/,
  )
  assert.doesNotThrow(() => verificarPuertos(RAIZ, [3000], win(ok(`3000\t55\t${MIO}\n`))))
})

// Pruebas del guion REAL de PowerShell (solo Windows): lo que Codex pidió en CAX-001 (R2).
const enWindows = { skip: process.platform !== 'win32' && 'solo corre en Windows' }

test('Windows real: sin escuchadores en el puerto, devuelve [] (la ausencia reconocida no es un fallo)', enWindows, () => {
  // Puerto efímero libre: se abre, se anota y se cierra antes de preguntar.
  assert.deepEqual(escuchadores([59999, 59998]), [])
})

test('Windows real: un fallo de enumeración del cmdlet aborta (no se da por «libre»)', enWindows, () => {
  // Un estado TCP inexistente hace fallar a `Get-NetTCPConnection` por dentro: con `SilentlyContinue` daba cero filas y código 0.
  assert.throws(() => escuchadores([59999], { estadoTcp: 'EstadoQueNoExiste' }), /No se pudo comprobar.*PowerShell/)
})

test('Windows real: un servidor ajeno que escucha se detecta con su pid', enWindows, async () => {
  const { createServer } = await import('node:net')
  const srv = createServer()
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  const puerto = srv.address().port
  try {
    const filas = escuchadores([puerto])
    assert.equal(filas.length >= 1, true)
    assert.equal(filas[0].puerto, puerto)
    assert.equal(filas[0].pid, process.pid)
  } finally {
    srv.close()
  }
})

test('Windows: código 0, salida vacía y error en stderr aborta (inyectado)', () => {
  const run = () => ({ status: 0, stdout: '', stderr: 'Get-NetTCPConnection : fallo interno' })
  assert.throws(() => escuchadores([3000], { run, plataforma: 'win32' }), /No se pudo comprobar.*PowerShell/)
})
