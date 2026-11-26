// Pruebas de la copia de producción P0.5. Corren sin red y sin base: `node --test scripts/prod-backup/__tests__/`
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CONSULTAS, inventariar, soloNombres, TACHADO, tachar } from '../config-inventario.mjs'
import { soloGet, tomarCredencial } from '../solo-get.mjs'
import { copiarStorage, NombreNoValido, urlDeObjeto, validarBase } from '../storage-tar.mjs'
import { crearEscritorTar, sha256, verificarTar } from '../tar-lib.mjs'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SECRETO = 'sb_secret_NO-DEBE-APARECER-0123456789'

/** Recoge lo que se escribe en un tar en memoria. */
function sumidero() {
  const salida = new PassThrough()
  const trozos = []
  salida.on('data', (t) => trozos.push(t))
  return { salida, buffer: () => Buffer.concat(trozos) }
}
const comoFlujo = (buf, paso = 700) => {
  const partes = []
  for (let i = 0; i < buf.length; i += paso) partes.push(buf.subarray(i, i + paso))
  return Readable.from(partes)
}
const respuesta = (status, cuerpo = '') => new Response(cuerpo, { status })

test('tar: lo que se empaqueta se verifica, también leído a trozos', async () => {
  const { salida, buffer } = sumidero()
  const tar = crearEscritorTar(salida)
  await tar.agregar('objetos/a/uno', Buffer.from('hola'))
  await tar.agregar('objetos/a/vacio', Buffer.alloc(0))
  await tar.agregar('objetos/b/grande', Buffer.alloc(5000, 7))
  const hash = await tar.cerrar({ tipo: 'prueba' })
  const r = await verificarTar(comoFlujo(buffer()))
  assert.equal(r.entradas, 3)
  assert.equal(r.bytes, 5004)
  assert.equal(r.manifiestoSha256, hash)
  assert.equal(r.datos.entradas[0].sha256, sha256(Buffer.from('hola')))
})

test('tar: el tar del sistema lo lee', async () => {
  const { salida, buffer } = sumidero()
  const tar = crearEscritorTar(salida)
  await tar.agregar('objetos/a/uno', Buffer.from('hola'))
  await tar.cerrar()
  const r = spawnSync('tar', ['-tf', '-'], { input: buffer(), encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['objetos/a/uno', 'MANIFEST.json'])
})

test('tar: un byte cambiado, un corte o una entrada de más hacen fallar la verificación', async () => {
  const { salida, buffer } = sumidero()
  const tar = crearEscritorTar(salida)
  await tar.agregar('objetos/a/uno', Buffer.from('hola mundo'))
  await tar.cerrar()
  const bueno = buffer()
  const alterado = Buffer.from(bueno)
  alterado[512] ^= 1
  await assert.rejects(verificarTar(comoFlujo(alterado)), /no coincide/)
  await assert.rejects(verificarTar(comoFlujo(bueno.subarray(0, 1024))), /cortado/)
  await assert.rejects(verificarTar(comoFlujo(Buffer.alloc(1024))), /MANIFEST/)
})

test('tar: rechaza rutas inseguras y repetidas', async () => {
  const tar = crearEscritorTar(sumidero().salida)
  await assert.rejects(tar.agregar('../fuera', Buffer.alloc(0)), /insegura/)
  await assert.rejects(tar.agregar('/abs', Buffer.alloc(0)), /insegura/)
  await assert.rejects(tar.agregar('MANIFEST.json', Buffer.alloc(0)), /reservado/)
  await tar.agregar('a', Buffer.alloc(1))
  await assert.rejects(tar.agregar('a', Buffer.alloc(1)), /repetida/)
})

test('soloGet: siempre GET, sin seguir redirecciones, reintenta 5xx y no filtra cabeceras', async () => {
  const llamadas = []
  const fetchImpl = async (url, init) => {
    llamadas.push(init)
    return llamadas.length < 3 ? respuesta(503) : respuesta(200, 'ok')
  }
  const r = await soloGet(new URL('https://ejemplo.invalid/x'), { authorization: SECRETO }, { fetchImpl, esperar: async () => {} })
  assert.equal(r.status, 200)
  assert.equal(llamadas.length, 3)
  for (const init of llamadas) {
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'error')
    assert.equal(init.body, undefined)
  }
  const siempreFalla = async () => {
    throw new TypeError(`fallo con ${SECRETO}`)
  }
  await assert.rejects(
    soloGet(new URL('https://ejemplo.invalid/x?token=1'), { authorization: SECRETO }, { fetchImpl: siempreFalla, esperar: async () => {} }),
    (err) => !err.message.includes(SECRETO) && !err.message.includes('token=1') && /3 intentos/.test(err.message),
  )
  await assert.rejects(soloGet('https://ejemplo.invalid/x', {}), /URL ya validado/)
})

test('tomarCredencial: la lee y la borra del entorno', () => {
  process.env.TINDIVO_PRUEBA_CRED = SECRETO
  assert.equal(tomarCredencial('TINDIVO_PRUEBA_CRED'), SECRETO)
  assert.equal(process.env.TINDIVO_PRUEBA_CRED, undefined)
  assert.throws(() => tomarCredencial('TINDIVO_PRUEBA_CRED'), /falta la credencial/)
})

test('storage: la URL solo puede ser la del destino, y los nombres con «..» no se piden', () => {
  assert.equal(validarBase('prod', 'https://zpnipajgwfthxhdtzhly.supabase.co'), 'https://zpnipajgwfthxhdtzhly.supabase.co')
  assert.throws(() => validarBase('prod', 'https://psjigdoinfpgrnedxeyf.supabase.co'), /no corresponde/)
  assert.throws(() => validarBase('prod', 'http://127.0.0.1:54321'), /no corresponde/)
  assert.throws(() => validarBase('local', 'https://zpnipajgwfthxhdtzhly.supabase.co'), /no corresponde/)
  assert.throws(() => validarBase('otro', 'http://127.0.0.1:54321'), /desconocido/)
  const u = urlDeObjeto('http://127.0.0.1:54321', 'logos', 'neg ocio/á#?.png')
  assert.equal(u.pathname, '/storage/v1/object/authenticated/logos/neg%20ocio/%C3%A1%23%3F.png')
  assert.equal(u.search, '')
  assert.throws(() => urlDeObjeto('http://127.0.0.1:54321', 'logos', '../otro/x'), NombreNoValido)
  assert.throws(() => urlDeObjeto('http://127.0.0.1:54321', '..', 'x'), NombreNoValido)
})

test('storage: baja con GET, empaqueta, anota lo que falta y no escribe la clave en ningún lado', async () => {
  const pedidos = []
  const servidor = createServer((req, res) => {
    pedidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey })
    if (req.url.endsWith('/logos/a/uno.png')) return res.end(Buffer.from('PNG-uno'))
    if (req.url.endsWith('/logos/b%20c/dos.png')) return res.end(Buffer.alloc(3000, 1))
    res.statusCode = 404
    res.end('{"error":"not_found"}')
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const lista = [
    { bucket: 'logos', id: '11111111-1111-4111-8111-111111111111', name: 'a/uno.png', size: 7, mimetype: 'image/png' },
    { bucket: 'logos', id: '22222222-2222-4222-8222-222222222222', name: 'b c/dos.png', size: 9999 },
    { bucket: 'logos', id: '33333333-3333-4333-8333-333333333333', name: 'borrado.png', size: 1 },
    { bucket: 'logos', id: '44444444-4444-4444-8444-444444444444', name: '../escapa.png', size: 1 },
  ]
  const { salida, buffer } = sumidero()
  const avisos = []
  try {
    const { resumen, manifiestoSha256 } = await copiarStorage({
      base,
      clave: SECRETO,
      lineas: Readable.from(lista.map((o) => JSON.stringify(o))),
      salida,
      avisar: (m) => avisos.push(m),
    })
    assert.deepEqual(resumen, { listados: 4, ok: 2, no_encontrados: 1, nombre_no_valido: 1, tamano_distinto: 1, bytes: 3007 })
    const v = await verificarTar(comoFlujo(buffer()))
    assert.equal(v.manifiestoSha256, manifiestoSha256)
    assert.equal(v.entradas, 2)
    assert.deepEqual(
      v.datos.objetos.map((o) => o.estado),
      ['ok', 'ok_tamano_distinto', 'no_encontrado', 'nombre_no_valido'],
    )
    assert.equal(v.datos.objetos[0].ruta, 'objetos/logos/11111111-1111-4111-8111-111111111111')
  } finally {
    servidor.close()
  }
  assert.equal(pedidos.length, 3)
  for (const p of pedidos) {
    assert.equal(p.metodo, 'GET')
    assert.equal(p.auth, `Bearer ${SECRETO}`)
    assert.equal(p.apikey, SECRETO)
  }
  assert.ok(!buffer().includes(SECRETO), 'la clave no va dentro del tar')
  assert.ok(!avisos.join('\n').includes(SECRETO))
})

test('storage: un 403 detiene la copia y el error no trae la clave', async () => {
  const { salida } = sumidero()
  await assert.rejects(
    copiarStorage({
      base: 'http://127.0.0.1:54321',
      clave: SECRETO,
      lineas: Readable.from([JSON.stringify({ bucket: 'b', id: 'x', name: 'a.png', size: 1 })]),
      salida,
      fetchImpl: async () => respuesta(403, `denegado ${SECRETO}`),
    }),
    (err) => /HTTP 403/.test(err.message) && !err.message.includes(SECRETO),
  )
})

test('storage: si no baja ningún objeto, o la red falla, la parte falla sin nombrar el archivo en el error', async () => {
  const linea = JSON.stringify({ bucket: 'comprobantes', id: 'id-1', name: 'cliente-juan-perez/yape.png', size: 1 })
  await assert.rejects(
    copiarStorage({
      base: 'http://127.0.0.1:54321',
      clave: SECRETO,
      lineas: Readable.from([linea]),
      salida: sumidero().salida,
      fetchImpl: async () => respuesta(404, 'no'),
    }),
    /no se pudo bajar ninguno/,
  )
  await assert.rejects(
    copiarStorage({
      base: 'http://127.0.0.1:54321',
      clave: SECRETO,
      lineas: Readable.from([linea]),
      salida: sumidero().salida,
      fetchImpl: async () => respuesta(503, 'caído'),
      esperar: async () => {},
    }),
    (err) => /objeto 1 \(id id-1\)/.test(err.message) && !err.message.includes('juan') && !err.message.includes(SECRETO),
  )
  await assert.rejects(
    copiarStorage({
      base: 'http://127.0.0.1:54321',
      clave: SECRETO,
      lineas: Readable.from(['{"name":"cliente-juan-perez/yape.png"']),
      salida: sumidero().salida,
    }),
    (err) => /línea 1/.test(err.message) && !err.message.includes('juan'),
  )
})

test('config: tacha los valores secretos y deja lo que dice cómo está configurado', () => {
  assert.equal(tachar({ hook_custom_access_token_uri: 'pg-functions://postgres/auth_hooks/x' }).hook_custom_access_token_uri, 'pg-functions://postgres/auth_hooks/x')
  assert.equal(tachar({ password_required_characters: 'abc:123' }).password_required_characters, 'abc:123')
  assert.equal(tachar({ hook_custom_access_token_secrets: SECRETO }).hook_custom_access_token_secrets, TACHADO)
  const entrada = {
    site_url: 'https://tindivo.com',
    external_google_enabled: true,
    external_google_client_id: 'id-publico.apps.googleusercontent.com',
    external_google_secret: SECRETO,
    smtp_pass: SECRETO,
    sms_twilio_auth_token: SECRETO,
    sms_test_otp: '51999999999=123456',
    jwt_exp: 3600,
    jwt_secret: SECRETO,
    hook_send_sms_secrets: SECRETO,
    service_role_key: SECRETO,
    smtp_admin_email: '',
    anidado: [{ api_key: SECRETO, nombre: 'x' }],
    connectionString: `postgres://u:${SECRETO}@h/db`,
  }
  const salida = tachar(entrada)
  assert.ok(!JSON.stringify(salida).includes(SECRETO))
  assert.equal(salida.site_url, 'https://tindivo.com')
  assert.equal(salida.external_google_client_id, 'id-publico.apps.googleusercontent.com')
  assert.equal(salida.external_google_secret, TACHADO)
  assert.equal(salida.sms_test_otp, TACHADO)
  assert.equal(salida.jwt_exp, 3600)
  assert.equal(salida.smtp_admin_email, '')
  assert.equal(salida.anidado[0].nombre, 'x')
  assert.deepEqual(soloNombres([{ name: 'FCM_KEY', value: SECRETO }]), [{ name: 'FCM_KEY', updated_at: null }])
})

test('config: solo GET a la API de gestión de tindivo-prod; el tar no trae valores secretos ni el token', async () => {
  const pedidos = []
  const fetchImpl = async (url, init) => {
    pedidos.push({ url: String(url), init })
    if (String(url).endsWith('/secrets')) return respuesta(200, JSON.stringify([{ name: 'APNS_KEY', value: SECRETO }]))
    if (String(url).endsWith('/network-restrictions')) return respuesta(404, 'no')
    return respuesta(200, JSON.stringify({ jwt_secret: SECRETO, site_url: 'https://tindivo.com' }))
  }
  const { salida, buffer } = sumidero()
  const { estados } = await inventariar({ ref: 'zpnipajgwfthxhdtzhly', token: `tok-${SECRETO}`, salida, fetchImpl })
  assert.equal(pedidos.length, CONSULTAS.length)
  for (const p of pedidos) {
    assert.equal(p.init.method, 'GET')
    assert.ok(p.url.startsWith('https://api.supabase.com/v1/projects/zpnipajgwfthxhdtzhly'))
  }
  assert.equal(estados['restricciones-de-red'], 404)
  assert.ok(!buffer().includes(SECRETO))
  const v = await verificarTar(comoFlujo(buffer()))
  assert.equal(v.entradas, CONSULTAS.length)
  await assert.rejects(
    inventariar({ ref: 'psjigdoinfpgrnedxeyf', token: 't', salida: sumidero().salida, fetchImpl }),
    /solo se saca de tindivo-prod/,
  )
  await assert.rejects(
    inventariar({ ref: 'zpnipajgwfthxhdtzhly', token: 't', salida: sumidero().salida, fetchImpl: async () => respuesta(401, 'no') }),
    /token sin permiso/,
  )
})

// --- Guardas estáticas: lo que hace que el procedimiento NO PUEDA escribir en producción -----------------------

const leer = (nombre) => readFileSync(join(DIR, nombre), 'utf8')
const sinComentarios = (texto) =>
  texto
    .split('\n')
    .filter((l) => !/^\s*(#|--|\/\/)/.test(l))
    .join('\n')

test('guarda: el guion del contenedor no contiene ninguna sentencia que escriba en la base', () => {
  const guion = sinComentarios(leer('en-contenedor.sh'))
  const escribe =
    /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|reindex|vacuum|refresh|merge|lock|call|comment on|security label|set role)\b|\bdo\s*\$/i
  const lineas = guion.split('\n').filter((l) => escribe.test(l))
  assert.deepEqual(lineas, [])
  assert.ok(!/decrypted_secrets/.test(guion), 'nunca se lee la vista con los secretos en claro')
  assert.match(guion, /select id, name, description, created_at, updated_at from vault\.secrets/)
  assert.equal((guion.match(/vault\.secrets/g) ?? []).length, 2, 'vault.secrets: solo la guarda de permiso y la consulta de nombres')
  assert.match(guion, /repeatable read read only/)
  assert.match(guion, /--no-role-passwords/)
})

test('guarda: en toda la carpeta solo hay una llamada HTTP, y es un GET', () => {
  const fuentes = readdirSync(DIR).filter((f) => f.endsWith('.mjs'))
  let llamadas = 0
  for (const f of fuentes) {
    const texto = sinComentarios(leer(f))
    llamadas += (texto.match(/\bfetchImpl\(/g) ?? []).length
    assert.ok(!/\bfetch\(/.test(texto), `${f}: fetch( directo`)
    assert.ok(!/node:https?['"]|XMLHttpRequest|child_process|node:fs['"]|writeFile/.test(texto), `${f}: usa algo que no debe`)
    assert.ok(!/method:\s*['"](?!GET)/.test(texto), `${f}: método distinto de GET`)
  }
  assert.equal(llamadas, 1)
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sh'))) {
    const texto = sinComentarios(leer(f))
    assert.ok(!/\b(curl|wget)\b|supabase\s+(db|link|functions|migration|secrets|projects)\b/.test(texto), `${f}: comando que no debe`)
    if (f !== 'en-contenedor.sh') {
      assert.ok(!/(^|[|;&(]\s*)(psql|pg_dump|pg_dumpall|pg_restore)\s/m.test(texto), `${f}: habla con la base fuera del contenedor`)
    }
    assert.ok(!/db push|db reset|migration (up|repair)|functions deploy|--linked/.test(texto), `${f}: comando de despliegue`)
  }
})

test('guarda: contra prod no corre sin terminal, ni con argumentos raros', () => {
  const sinTty = spawnSync('bash', [join(DIR, 'copia.sh'), '--destino', 'prod', '--commit-firmado', '0'.repeat(40)], {
    input: '',
    encoding: 'utf8',
  })
  assert.notEqual(sinTty.status, 0)
  assert.match(sinTty.stderr, /hace falta una terminal/)
  assert.equal(spawnSync('bash', [join(DIR, 'copia.sh')], { input: '', encoding: 'utf8' }).status, 64)
  assert.equal(spawnSync('bash', [join(DIR, 'copia.sh'), '--destino', 'staging'], { input: '', encoding: 'utf8' }).status, 64)
})

test('guarda: reglas de la clave de cifrado', () => {
  const probar = (clave) =>
    spawnSync('bash', ['-c', 'source ./comun.sh; validar_clave "$1"', '_', clave], { cwd: DIR, encoding: 'utf8' }).status
  assert.equal(probar('una clave larga de verdad 2026'), 0)
  assert.notEqual(probar('corta'), 0)
  assert.notEqual(probar('clave con eñe y tilde larguísima'), 0)
  assert.notEqual(probar(' empieza con espacio y es larga'), 0)
})
