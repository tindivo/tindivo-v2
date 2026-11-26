// Pruebas de la copia de producción P0.5. Corren sin red y sin base: `node --test scripts/prod-backup/__tests__/`
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { soloGet, tomarCredencial } from '../solo-get.mjs'
import { copiarStorage, huella, NombreNoValido, urlDeObjeto, validarBase } from '../storage-tar.mjs'
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

test('tar: un manifiesto roto o un tar dañado no copian su contenido al mensaje de error', async () => {
  const cabeceraDe = async (ruta, cuerpo) => {
    const { salida, buffer } = sumidero()
    const t = crearEscritorTar(salida)
    await t.agregar(ruta, cuerpo)
    await t.cerrar()
    return buffer().subarray(0, 512)
  }
  const marca = Buffer.from('{"cliente":"JUAN PEREZ 999888777"')
  const h = Buffer.from(await cabeceraDe('x', marca))
  h.fill(0, 0, 100)
  h.write('MANIFEST.json', 0, 'utf8')
  const roto = Buffer.concat([h, marca, Buffer.alloc(512 - marca.length), Buffer.alloc(1024)])
  await assert.rejects(verificarTar(comoFlujo(roto)), (err) => /no es JSON válido/.test(err.message) && !err.message.includes('JUAN'))
  const r = spawnSync('node', [join(DIR, 'verificar-tar.mjs')], { input: roto, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
  assert.ok(!`${r.stdout}${r.stderr}`.includes('JUAN'))
})

test('guarda: las credenciales no se exportan a procesos que no las necesitan', () => {
  const contenedor = sinComentarios(leer('en-contenedor.sh'))
  assert.ok(!/export[^\n]*PGPASSWORD/.test(contenedor), 'PGPASSWORD no se exporta en el contenedor')
  assert.match(contenedor, /pg\(\) \{ PGPASSWORD="\$CONTRASENA" "\$@"; \}/)
  for (const cliente of ['psql', 'pg_dump']) {
    const sueltos = contenedor.split('\n').filter((l) => new RegExp(`(^|[;&|(]|then|if|!)\\s*${cliente} `).test(l))
    assert.deepEqual(sueltos.filter((l) => !l.includes('--version') && !l.includes('if (l ~ /')), [], `${cliente} sin pasar por pg()`)
  }
  const copia = sinComentarios(leer('copia.sh'))
  assert.ok(!/export[^\n]*(TINDIVO_STORAGE_KEY|DB_PASS|CLAVE)\b/.test(copia))
  assert.match(copia, /TINDIVO_STORAGE_KEY="\$STORAGE_KEY" node /)
  assert.match(copia, /contra prod hace falta --ca/)
  assert.match(copia, /PGSSLMODE=verify-full PGREQUIREAUTH=scram-sha-256/)
  assert.ok(!/PGSSLMODE=require/.test(copia))
})

// --- Guardas estáticas: lo que hace que el procedimiento NO PUEDA escribir en producción -----------------------

const leer = (nombre) => readFileSync(join(DIR, nombre), 'utf8')
const sinComentarios = (texto) =>
  texto
    .split('\n')
    .filter((l) => !/^\s*(#|--|\/\/)/.test(l))
    .join('\n')

test('guarda: el guion del contenedor no contiene ninguna sentencia que escriba en la base', () => {
  // El filtro de diagnósticos nombra sentencias (LOCK TABLE, «cannot execute…») para reconocerlas: no las ejecuta.
  const guion = sinComentarios(leer('en-contenedor.sh')).replace(/\nfiltrar\(\) \{\n[\s\S]*?\n\}\n/, '\n')
    .replace(/\nSQL_ROLES="[\s\S]*?"\n/, '\n')
  assert.ok(!guion.includes('function clasifica') && !guion.includes('SQL_ROLES="select'), 'el filtro y el texto de roles.sql tienen su propia guarda')
  const escribe =
    /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|reindex|vacuum|refresh|merge|lock|call|comment on|security label|set role)\b|\bdo\s*\$/i
  const lineas = guion.split('\n').filter((l) => escribe.test(l))
  assert.deepEqual(lineas, [])
  assert.ok(!/decrypted_secrets/.test(guion), 'nunca se lee la vista con los secretos en claro')
  assert.match(guion, /select id, name, description, created_at, updated_at from vault\.secrets/)
  assert.equal((guion.match(/vault\.secrets/g) ?? []).length, 2, 'vault.secrets: solo la guarda de permiso y la consulta de nombres')
  assert.match(guion, /repeatable read read only/)
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

// --- Ronda 3 -----------------------------------------------------------------------------------------------------

const ID = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`

test('storage: solo es COMPLETA si cada objeto se bajó con el tamaño y la huella que describe el snapshot', async () => {
  const pedidos = []
  const cuerpos = {
    '/logos/a/uno.png': [Buffer.from('PNG-uno'), '"etag-uno-0001"'],
    '/logos/b%20c/dos.png': [Buffer.alloc(3000, 1), '"etag-dos-0002"'],
    '/logos/mismo-tamano.png': [Buffer.from('BYTES-NUEVOS'), '"etag-nuevo-9999"'],
    '/logos/sin-etag-servido.png': [Buffer.from('abc'), null],
    '/logos/sin-etag-en-base.png': [Buffer.from('abc'), '"etag-x-00000005"'],
  }
  const servidor = createServer((req, res) => {
    pedidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey })
    const clave = Object.keys(cuerpos).find((k) => req.url.endsWith(k))
    if (!clave) {
      res.statusCode = 404
      return res.end('{"error":"not_found"}')
    }
    const [cuerpo, etag] = cuerpos[clave]
    if (etag) res.setHeader('etag', etag)
    res.end(cuerpo)
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const lista = [
    { bucket: 'logos', id: ID(1), name: 'a/uno.png', size: 7, etag: '"etag-uno-0001"', mimetype: 'image/png' },
    { bucket: 'logos', id: ID(2), name: 'b c/dos.png', size: 9999, etag: '"etag-dos-0002"' },
    { bucket: 'logos', id: ID(3), name: 'borrado.png', size: 1, etag: '"etag-tres-0003"' },
    { bucket: 'logos', id: ID(4), name: '../escapa.png', size: 1, etag: '"etag-cuatro-04"' },
    // Sustituido después del snapshot por OTRO contenido de la MISMA longitud (12 bytes): la huella lo delata.
    { bucket: 'logos', id: ID(5), name: 'mismo-tamano.png', size: 12, etag: '"etag-viejo-0005"' },
    { bucket: 'logos', id: ID(6), name: 'sin-etag-servido.png', size: 3, etag: '"etag-seis-0006"' },
    { bucket: 'logos', id: ID(7), name: 'sin-etag-en-base.png', size: 3 },
  ]
  const { salida, buffer } = sumidero()
  const avisos = []
  try {
    const { resumen, completa, manifiestoSha256 } = await copiarStorage({
      base,
      clave: SECRETO,
      lineas: Readable.from(lista.map((o) => JSON.stringify(o))),
      salida,
      avisar: (m) => avisos.push(m),
    })
    assert.deepEqual(resumen, {
      listados: 7,
      ok: 1,
      bajados: 5,
      no_encontrados: 1,
      nombre_no_valido: 1,
      tamano_distinto: 1,
      sin_huella: 2,
      huella_distinta: 1,
      bytes: 7 + 3000 + 12 + 3 + 3,
    })
    assert.equal(completa, false)
    const v = await verificarTar(comoFlujo(buffer()))
    assert.equal(v.manifiestoSha256, manifiestoSha256)
    assert.equal(v.datos.completa, false)
    assert.deepEqual(
      v.datos.objetos.map((o) => o.estado),
      ['ok', 'tamano_distinto', 'no_encontrado', 'nombre_no_valido', 'huella_distinta', 'sin_huella', 'sin_huella'],
    )
    assert.equal(v.datos.objetos[0].ruta, `objetos/logos/${ID(1)}`)
  } finally {
    servidor.close()
  }
  for (const p of pedidos) {
    assert.equal(p.metodo, 'GET')
    assert.equal(p.auth, `Bearer ${SECRETO}`)
    assert.equal(p.apikey, SECRETO)
  }
  assert.ok(!buffer().includes(SECRETO), 'la clave no va dentro del tar')
  assert.ok(!avisos.join('\n').includes(SECRETO))

  // Y el caso bueno: todo coincide → COMPLETA.
  const bueno = await copiarStorage({
    base: 'http://127.0.0.1:54321',
    clave: SECRETO,
    lineas: Readable.from([JSON.stringify({ bucket: 'b', id: ID(1), name: 'a.png', size: 3, etag: 'W/"etag-bueno-01"' })]),
    salida: sumidero().salida,
    fetchImpl: async () => new Response('abc', { status: 200, headers: { etag: '"etag-bueno-01"' } }),
  })
  assert.equal(bueno.completa, true)
  assert.equal(huella('"abc"'), '', 'una huella demasiado corta no vale como huella')
  assert.equal(huella({ a: 1 }), '')
})

test('filtro del contenedor: ninguna línea ajena se reenvía; cada forma conocida sale como un texto fijo', () => {
  const M = 'JUAN PEREZ 999888777'
  // Un marcador personal detrás (o dentro) de CADA forma que el filtro reconoce, y varias que no reconoce.
  const conMarcador = [
    `psql: error: connection to server at "h" (1.2.3.4), port 5432 failed: FATAL:  password authentication failed for user "${M}"`,
    `pg_dump: error: connection to server at "${M}" (1.2.3.4), port 5432 failed: ${M}`,
    `psql: error: could not translate host name "${M}" to address: ${M}`,
    `psql: error: SSL error: ${M}`,
    `psql: error: certificate verify failed ${M}`,
    `psql: error: server certificate for "${M}" does not match host name "${M}"`,
    `psql: error: authentication method requirement "scram-sha-256" failed: ${M}`,
    `psql: error: timeout expired ${M}`,
    `pg_dump: error: query failed: ERROR:  permission denied for table ${M}`,
    `pg_dump: error: query failed: ERROR:  permission denied for table users; ${M}`,
    `pg_dump: detail: Query was: LOCK TABLE auth.users, "${M}" IN ACCESS SHARE MODE`,
    `psql:/work/.ctl:9: ERROR:  cannot execute INSERT in a read-only transaction`,
    `psql:/work/.ctl:9: ERROR:  canceling statement due to statement timeout ${M}`,
    `pg_dump: error: could not write to file "${M}": No space left on device`,
    `tar: ${M}: short read`,
    `sha256sum: WARNING: 1 of 21 computed checksums did NOT match ${M}`,
    `psql:/work/.ctl:14: ERROR:  invalid input syntax for type bigint: "${M}"`,
    `DETAIL:  Key (phone)=(${M}) already exists.`,
    `CONTEXT:  COPY users, line 3, column phone: "${M}"`,
    `[contenedor] DNI 45678912 ${M}`,
    `[contenedor] diagnostico: ${M}`,
    `pg_dump: detail: server version: 17.4; pg_dump version: 17.6 ${M}`,
    'pg_dump: detail: Query was: LOCK TABLE Juan Perez, telefono 999888777, Jr. Lima 123',
    'CONTEXT: x ERROR:  permission denied for table sk_live_JUAN999888777',
    'pg_dump: error: query failed: ERROR:  permission denied for table JUAN_PEREZ_999888777',
  ]
  const limpias = [
    'marca1234 mensaje propio',
    'pg_dump: error: query failed: ERROR:  permission denied for table sso_domains',
    'pg_dump: detail: Query was: LOCK TABLE auth.sso_domains IN ACCESS SHARE MODE',
    'pg_dump: detail: server version: 17.4; pg_dump version: 17.6',
    'psql: error: connection to server at "aws-0-us-east-1.pooler.supabase.com" (1.2.3.4), port 5432 failed: SSL error: certificate verify failed',
  ]
  const r = spawnSync('bash', ['./en-contenedor.sh', 'filtrar'], {
    cwd: DIR,
    input: `${[...conMarcador, ...limpias].join('\n')}\n`,
    encoding: 'utf8',
    env: { ...process.env, TINDIVO_MARCA_PRUEBA: 'marca1234' },
  })
  assert.equal(r.status, 0, r.stderr)
  for (const trozo of ['JUAN', 'PEREZ', '999888777', '45678912']) assert.ok(!r.stdout.includes(trozo), `se coló «${trozo}»:\n${r.stdout}`)
  // Ninguna línea de entrada sale tal cual (salvo que el filtro la haya reescrito): todo empieza por «[contenedor] ».
  for (const linea of r.stdout.trim().split('\n')) assert.match(linea, /^\[contenedor\] /)
  assert.ok(r.stdout.includes('[contenedor] mensaje propio'))
  assert.ok(r.stdout.includes('[contenedor] diagnostico: permiso denegado sobre un objeto de la base'))
  assert.ok(r.stdout.includes('[contenedor] diagnostico: pg_dump no pudo bloquear en lectura una tabla'))
  assert.ok(!r.stdout.includes('sso_domains'), 'ni siquiera el nombre de una tabla se reenvía')
  assert.ok(r.stdout.includes('[contenedor] diagnostico: version del servidor 17.4, de pg_dump 17.6'))
  assert.ok(r.stdout.includes('[contenedor] diagnostico: no se pudo conectar: el certificado del servidor no lo firma la CA indicada'))
  assert.ok(r.stdout.includes('[contenedor] diagnostico: no se pudo conectar: usuario o contrasena rechazados'))
  assert.match(r.stdout, /\d+ linea\(s\) de diagnostico omitidas/)
})

test('guarda: una credencial heredada del entorno no llega ni al primer proceso hijo, tampoco en las salidas tempranas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'copia-shims-'))
  try {
    const shim = [
      '#!/usr/bin/env bash',
      'd="${BASH_SOURCE[0]%/*}"; n="${BASH_SOURCE[0]##*/}"',
      // export -p no lista funciones: declare -fx muestra las exportadas, que viajan como BASH_FUNC_<nombre>%%.
      'case "$(export -p; declare -fx) $*" in *MARCADOR_HEREDADO*) r=CON_MARCADOR ;; *) r=limpio ;; esac',
      'printf \'%s %s\\n\' "$n" "$r" >> "$d/registro.txt"',
      'exit 1',
      '',
    ].join('\n')
    const programas = ['docker', 'git', 'gpg', 'gpgconf', 'node', 'sha256sum', 'tar', 'tee', 'sed', 'dirname', 'date',
      'mktemp', 'grep', 'head', 'od', 'find', 'cat', 'rm', 'cygpath', 'powershell.exe', 'awk', 'cut', 'tail', 'tr', 'chmod', 'mkdir']
    for (const p of programas) {
      writeFileSync(join(dir, p), shim)
      chmodSync(join(dir, p), 0o755)
    }
    const heredadas = ['PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_DB_PASSWORD', 'TINDIVO_STORAGE_KEY', 'TINDIVO_MGMT_TOKEN', 'DB_PASS', 'STORAGE_KEY', 'MGMT_TOKEN', 'CLAVE',
      'NODE_OPTIONS', 'DOCKER_HOST', 'HTTPS_PROXY', 'TINDIVO_CA_PEM', 'TINDIVO_GUION',
      // Y variables que NINGUNA lista de «prohibidas» habría previsto: el entorno se reduce a una lista de permitidas.
      'SUPABASE_DB_URL', 'SUPABASE_SERVICE_KEY', 'POSTGRES_URL_NON_POOLING', 'DIRECT_URL', 'JWT_SECRET', 'SERVICE_ROLE_KEY',
      'VERCEL_TOKEN', 'GH_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'UNA_VARIABLE_CUALQUIERA', 'otra_en_minusculas', '_RARA',
      // CAX-001: la lista de permitidas lleva nombres exactos; nada que empiece por BASH o MSYSTEM_ pasa por serlo.
      'BASH_FOO', 'BASHFOO', 'BASH_ENV', 'BASH_VERSION_FALSA', 'MSYSTEM_FOO', 'MSYSTEM_TOKEN', 'MSYSTEMX']
    const env = { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` }
    for (const v of heredadas) env[v] = 'MARCADOR_HEREDADO'
    // Una función exportada con un secreto dentro: también es una variable de entorno (BASH_FUNC_<nombre>%%).
    env['BASH_FUNC_secreto_heredado%%'] = '() { echo MARCADOR_HEREDADO; }'
    const correr = (guion, args, extra = {}) =>
      spawnSync('bash', [`./${guion}`, ...args], { cwd: DIR, input: '', encoding: 'utf8', env: { ...env, ...extra } })

    correr('copia.sh', ['--destino', 'local'])
    correr('copia.sh', ['--destino', 'local', '--salida', join(DIR, 'no-debe-crearse')])
    correr('copia.sh', [])
    correr('copia.sh', ['--destino', 'staging'])
    correr('verificar.sh', [dir])
    correr('verificar.sh', [])
    // Contra prod, además, las credenciales de ENSAYO se borran antes de lanzar nada.
    const local = { TINDIVO_COPIA_LOCAL_CLAVE: 'MARCADOR_HEREDADO', TINDIVO_COPIA_LOCAL_SERVICE_KEY: 'MARCADOR_HEREDADO',
      TINDIVO_COPIA_LOCAL_CONTRASENA: 'MARCADOR_HEREDADO' }
    const prod = correr('copia.sh', ['--destino', 'prod', '--commit-firmado', '0'.repeat(40), '--ca', 'x'], local)
    assert.match(prod.stderr, /hace falta una terminal/)

    const registro = readFileSync(join(dir, 'registro.txt'), 'utf8').trim().split('\n')
    assert.ok(registro.length >= 3, 'los shims tienen que haberse ejecutado (si no, la prueba no prueba nada)')
    assert.deepEqual(registro.filter((l) => !l.endsWith(' limpio')), [])
    assert.ok(!existsSync(join(DIR, 'no-debe-crearse')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('guarda: roles.sql sale del snapshot con consultas de solo lectura sobre pg_roles (sin pg_dumpall ni contraseñas)', () => {
  const guion = leer('en-contenedor.sh')
  const m = guion.match(/\nSQL_ROLES="([\s\S]*?)"\n/)
  assert.ok(m, 'no se encontró SQL_ROLES')
  const sentencias = m[1]
    .split(/;\n(?=select )/)
    .map((x) => x.trim())
    .filter(Boolean)
  assert.equal(sentencias.length, 4)
  for (const x of sentencias) assert.match(x, /^select format\('(CREATE ROLE|ALTER ROLE|GRANT) /)
  assert.ok(!/pg_authid|rolpassword|pg_shadow/.test(guion))
  assert.ok(!/pg_dumpall/.test(sinComentarios(guion)), 'pg_dumpall no admite snapshot: no se usa')
  assert.match(guion, /\\\\o \$W\/roles\.sql\n\\\\qecho[^\n]*\n\$SQL_ROLES\n\\\\o\n/)
})
