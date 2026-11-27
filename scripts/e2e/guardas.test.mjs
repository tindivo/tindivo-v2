/**
 * Pruebas NEGATIVAS de las guardas e2e: `node --test scripts/e2e/guardas.test.mjs`. No necesitan la base ni la API.
 * Los scripts se lanzan con el PATH vacío y/o apuntando a un puerto muerto: si una guardia fallara, lo que intentaría
 * (`supabase db reset`, escribir en la base) no encuentra nada que tocar.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUploadUrl, fetchSinRedireccion } from './guardas.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SUPABASE = 'http://127.0.0.1:54321'

test('un uploadUrl de otro origen se rechaza antes de enviar', () => {
  for (const malo of [
    'https://evil.example/storage/v1/object/x',
    'http://127.0.0.1:9999/x',
    'https://127.0.0.1:54321/x',
  ]) {
    assert.throws(() => assertUploadUrl(malo, SUPABASE), /no es la Supabase permitida/)
  }
  assert.throws(() => assertUploadUrl('no es una url', SUPABASE), /no son URL válidas/)
  assert.doesNotThrow(() =>
    assertUploadUrl('http://127.0.0.1:54321/storage/v1/object/upload/sign/b/x?token=1', SUPABASE),
  )
})

test('una redirección no se sigue: es un error y el destino no recibe nada', async () => {
  let destinoRecibio = false
  const destino = createServer((_req, res) => {
    destinoRecibio = true
    res.end('ok')
  })
  await new Promise((r) => destino.listen(0, '127.0.0.1', r))
  const origen = createServer((_req, res) => {
    res.writeHead(307, { location: `http://127.0.0.1:${destino.address().port}/robo` })
    res.end()
  })
  await new Promise((r) => origen.listen(0, '127.0.0.1', r))
  try {
    await assert.rejects(
      fetchSinRedireccion(`http://127.0.0.1:${origen.address().port}/subir`, {
        method: 'PUT',
        body: 'comprobante',
      }),
      /redirección no se sigue/,
    )
    assert.equal(destinoRecibio, false, 'el destino de la redirección recibió la petición')
  } finally {
    origen.close()
    destino.close()
  }
})

/** Entorno sin ninguna señal de candado (ni token ni bypass de CI) y sin PATH. */
function entornoSinCandado() {
  const env = { ...process.env, PATH: '' }
  for (const k of ['TINDIVO_DB_LOCK_TOKEN', 'TINDIVO_DB_LOCK_BYPASS', 'CI', 'Path']) delete env[k]
  return env
}

const MUERTO = ['--supabase-url', 'http://127.0.0.1:1', '--api-url', 'http://127.0.0.1:1/api/v1']
for (const [nombre, args] of [
  ['ciclo.mjs --reset', ['scripts/e2e/ciclo.mjs', '--reset']],
  ['ciclo.mjs', ['scripts/e2e/ciclo.mjs']],
  ['flujo-completo.ts', ['scripts/e2e/flujo-completo.ts', ...MUERTO]],
]) {
  test(`${nombre} lanzado directo, sin candado, sale con error antes de tocar nada`, () => {
    const r = spawnSync(process.execPath, args, { cwd: REPO, env: entornoSinCandado(), encoding: 'utf8' })
    const salida = `${r.stdout}${r.stderr}`
    assert.equal(r.status, 2, `salió con ${r.status}: ${salida}`)
    assert.match(r.stderr, /base local es compartida/)
    assert.doesNotMatch(salida, /Resetting local database|Flujo completo|▶/)
  })
}
