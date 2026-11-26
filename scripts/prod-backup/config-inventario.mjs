#!/usr/bin/env node
// Copia de producción P0.5, parte 3: inventario de la configuración que NO vive en la base
// (Auth, Edge Functions, nombres de secretos, API, red). Solo GET a la API de gestión de Supabase.
//
//   stdout  un tar con un JSON por consulta (va directo a gpg)
//   stderr  qué consultas respondieron, sin contenido, y ESTADO=COMPLETA o ESTADO=PARCIAL
//
// El token personal llega por TINDIVO_MGMT_TOKEN.
//
// Qué se guarda de cada respuesta (tachado POR DEFECTO): la estructura y los nombres de las claves siempre; los
// números y booleanos, salvo bajo una clave sensible; y un texto SOLO si su clave está en la lista de claves
// conocidas e inofensivas y además no tiene pinta de secreto. Todo otro texto queda como «valor sin clasificar».
// De una URL solo se guarda esquema y host: la ruta, el usuario, los parámetros y el fragmento se tachan.
// El inventario dice qué está configurado, no cuánto vale.
import { pathToFileURL } from 'node:url'
import { soloGet, tomarCredencial } from './solo-get.mjs'
import { crearEscritorTar } from './tar-lib.mjs'

const REF_PROD = 'zpnipajgwfthxhdtzhly'
const API = 'https://api.supabase.com'
export const TACHADO = '[TACHADO: hay un valor]'
export const SIN_CLASIFICAR = '[TACHADO: valor sin clasificar]'
const CLAVE_SENSIBLE =
  /(secret|password|passwd|pass$|_pass_|token|private|credential|jwt|otp|(^|_)keys?($|_)|api_?key|hash|salt|dsn|connection_?string)/i
// Claves que suenan a secreto pero solo dicen cómo está configurado algo (una URI de hook, un límite, un interruptor).
const CLAVE_DE_CONFIGURACION =
  /(_uri|_url|_enabled|_characters|_length|_exp|_algorithm|_interval|_period|_limit|_count|_size|_seconds)$|^rate_limit_/i
// Claves cuyo TEXTO se puede guardar (identificadores, estados, fechas, hosts, listas de esquemas, URL reducidas).
const CLAVE_DE_TEXTO_SEGURO =
  /(^|_)(id|ref|name|slug|status|region|version|provider|type|mode|kind|role|schema|schemas|path|at|host|domain|email|characters|algorithm|method|plan|timezone|aud|issuer|url|uri|list|identifier|cidrs|sha256)$/i
const TEXTO_CON_CREDENCIAL =
  /\/\/[^/\s@]+:[^/\s@]*@|[^\s@/:]+:[^\s@/:]+@[^\s@]+|[?&;](password|passwd|pass|pwd|token|secret|key|apikey|api_key|access_key)=/i
// Pinta de secreto: prefijos conocidos en cualquier parte, «algo = valor» con nombre de secreto, o una ristra larga
// sin espacios (salvo que sea un UUID, que es un identificador).
const PINTA_DE_SECRETO =
  /eyJ[A-Za-z0-9_-]{8,}|sb_|sbp_|sk_|pk_|ghp_|gho_|whsec_|AKIA|SG\.|Bearer |Basic |(password|passwd|secret|token|apikey|api_key)\s*[=:]|[A-Za-z0-9_+/=-]{32,}/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const NOMBRE_DE_SECRETO = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/
const enSnake = (clave) => clave.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** De una URL deja esquema y host. La ruta solo se conserva en un hook de Postgres (esquema y función). */
export function reducirUrl(texto) {
  let url
  try {
    url = new URL(texto)
  } catch {
    return SIN_CLASIFICAR
  }
  if (url.protocol === 'pg-functions:' && /^\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(url.pathname) && !url.search && !url.hash) {
    return `pg-functions://${url.host}${url.pathname}`
  }
  const resto = url.pathname && url.pathname !== '/' ? '/[ruta tachada]' : ''
  return `${url.protocol}//${url.host}${resto}`
}

function textoSeguro(valor) {
  if (valor.length > 300 || /[\u0000-\u001f]/.test(valor)) return SIN_CLASIFICAR
  const partes = valor.split(',').map((p) => p.trim())
  const salida = partes.map((p) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return reducirUrl(p)
    if (UUID.test(p)) return p
    if (TEXTO_CON_CREDENCIAL.test(p) || p.includes('://') || PINTA_DE_SECRETO.test(p)) return SIN_CLASIFICAR
    return p
  })
  return salida.join(', ')
}

/**
 * Tachado por defecto. La sospecha se hereda hacia abajo: dentro de una clave sensible se tacha todo texto y todo
 * número, se llamen como se llamen.
 */
export function tachar(valor, clave = '', heredado = false) {
  const k = enSnake(clave)
  const sensible = heredado || (CLAVE_SENSIBLE.test(k) && !CLAVE_DE_CONFIGURACION.test(k))
  if (Array.isArray(valor)) return valor.map((v) => tachar(v, clave, heredado))
  if (esObjeto(valor)) return Object.fromEntries(Object.entries(valor).map(([c, v]) => [c, tachar(v, c, sensible)]))
  if (typeof valor === 'number') return sensible ? TACHADO : valor
  if (typeof valor !== 'string' || valor === '') return valor
  if (sensible) return TACHADO
  if (!CLAVE_DE_TEXTO_SEGURO.test(k)) return SIN_CLASIFICAR
  // Una clave de fecha solo guarda una fecha.
  if (/(^|_)at$/i.test(k)) return FECHA_ISO.test(valor) ? valor : SIN_CLASIFICAR
  return textoSeguro(valor)
}

/** De la lista de secretos de las funciones solo se conserva el nombre (validado) y la fecha (validada). */
export function soloNombres(lista) {
  if (!Array.isArray(lista)) throw new Error('forma inesperada')
  return lista.map((s) => {
    // Un secreto es { name, value[, updated_at] }: con cualquier otra clave (p. ej. una función: slug, status) no lo es.
    const claves = esObjeto(s) ? Object.keys(s) : []
    const esSecreto = claves.length > 0 && claves.every((c) => c === 'name' || c === 'value' || c === 'updated_at')
    if (!esSecreto || typeof s.value !== 'string' || typeof s.name !== 'string' || !NOMBRE_DE_SECRETO.test(s.name)) {
      throw new Error('forma inesperada')
    }
    return { name: s.name, updated_at: typeof s.updated_at === 'string' && FECHA_ISO.test(s.updated_at) ? s.updated_at : null }
  })
}

// Forma mínima que debe tener cada respuesta 200 para contar como inventario. Sale de la referencia pública de la
// API de gestión de Supabase tal como se conocía al escribir esto; NO se ha contrastado con la API real (no hay token
// de producción antes de la firma). Si la API real no cuadra, el resultado es PARCIAL, nunca una falsa COMPLETA.
const texto = (v) => typeof v === 'string' && v.trim() !== ''
const FORMAS = {
  proyecto: (j, ref) => esObjeto(j) && (j.id === ref || j.ref === ref) && texto(j.name) && texto(j.region),
  auth: (j) => esObjeto(j) && texto(j.site_url) && typeof j.disable_signup === 'boolean' && typeof j.jwt_exp === 'number' && Object.keys(j).length >= 10,
  // tindivo-prod tiene desplegada al menos `send-push`: una lista vacía no es el inventario de sus funciones.
  'edge-functions': (j) =>
    Array.isArray(j) &&
    j.length > 0 &&
    j.every((f) => esObjeto(f) && texto(f.slug) && /^[A-Za-z0-9_-]{1,128}$/.test(f.slug) && typeof f.version === 'number' && texto(f.status)),
  'secretos-nombres': (j) => Array.isArray(j),
  postgrest: (j) => esObjeto(j) && texto(j.db_schema) && typeof j.max_rows === 'number',
  storage: (j) => esObjeto(j) && typeof j.fileSizeLimit === 'number' && j.fileSizeLimit > 0,
  pooler: (j) => {
    const lista = Array.isArray(j) ? j : [j]
    return lista.length > 0 && lista.every((x) => esObjeto(x) && texto(x.pool_mode))
  },
  'restricciones-de-red': (j) => esObjeto(j) && (esObjeto(j.config) || texto(j.entitlement)),
  'ssl-obligatorio': (j) => esObjeto(j) && esObjeto(j.currentConfig) && typeof j.currentConfig.database === 'boolean',
  'respaldos-de-la-plataforma': (j) => esObjeto(j) && Array.isArray(j.backups) && j.backups.every(esObjeto),
}

// [nombre, sufijo, obligatoria]. Una consulta obligatoria que no responde 200 con la forma esperada deja el
// inventario PARCIAL. En una opcional, solo un 404 («este proyecto no tiene eso») cuenta como «no aplica».
export const CONSULTAS = [
  ['proyecto', '', true],
  ['auth', '/config/auth', true],
  ['edge-functions', '/functions', true],
  ['secretos-nombres', '/secrets', true],
  ['postgrest', '/postgrest', true],
  ['storage', '/config/storage', false],
  ['pooler', '/config/database/pooler', false],
  ['restricciones-de-red', '/network-restrictions', false],
  ['ssl-obligatorio', '/ssl-enforcement', false],
  ['respaldos-de-la-plataforma', '/database/backups', false],
]

/**
 * @param {{ ref: string, token: string, salida: import('node:stream').Writable, avisar?: (m: string) => void,
 *   fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void> }} p
 */
export async function inventariar({ ref, token, salida, avisar = () => {}, fetchImpl, esperar }) {
  if (ref !== REF_PROD) throw new Error('el inventario de configuración solo se saca de tindivo-prod')
  const tar = crearEscritorTar(salida)
  const cabeceras = { authorization: `Bearer ${token}`, accept: 'application/json' }
  const estados = {}
  const pendientes = []
  for (const [nombre, sufijo, obligatoria] of CONSULTAS) {
    const url = new URL(`${API}/v1/projects/${ref}${sufijo}`)
    // Los estados son textos fijos: nunca se copia el cuerpo de una respuesta ni el mensaje de un error.
    let registro = { consulta: url.pathname, status: null, datos: null }
    let estado
    try {
      const { status, cuerpo } = await soloGet(url, cabeceras, { fetchImpl, esperar, timeoutMs: 30_000 })
      registro.status = status
      if (status === 200) {
        let json
        try {
          json = JSON.parse(cuerpo.toString('utf8'))
        } catch {
          json = undefined
        }
        if (json === undefined) {
          estado = 'respuesta_no_valida'
        } else if (!FORMAS[nombre](json, ref)) {
          estado = 'forma_inesperada'
        } else {
          try {
            registro.datos = nombre === 'secretos-nombres' ? soloNombres(json) : tachar(json)
            estado = 'ok'
          } catch {
            estado = 'forma_inesperada'
          }
        }
      } else if (status === 404 && !obligatoria) {
        estado = 'no_aplica'
      } else {
        estado = `http_${status}`
      }
    } catch {
      estado = 'error_de_red'
    }
    registro = { ...registro, estado, obligatoria }
    estados[nombre] = estado
    if (estado !== 'ok' && estado !== 'no_aplica') pendientes.push(nombre)
    avisar(`${nombre}: ${estado}`)
    await tar.agregar(`config/${nombre}.json`, Buffer.from(`${JSON.stringify(registro, null, 1)}\n`, 'utf8'))
  }
  if (estados.proyecto !== 'ok') {
    throw new Error('la API de gestión no devolvió el proyecto (¿token sin permiso o vencido?)')
  }
  const completa = pendientes.length === 0
  const manifiestoSha256 = await tar.cerrar({
    tipo: 'config',
    ref,
    tomado_utc: new Date().toISOString(),
    completa,
    pendientes,
    estados,
  })
  return { estados, completa, pendientes, manifiestoSha256 }
}

async function principal() {
  const avisar = (m) => console.error(`[config] ${m}`)
  try {
    const token = tomarCredencial('TINDIVO_MGMT_TOKEN')
    const r = await inventariar({ ref: process.argv[2], token, salida: process.stdout, avisar })
    await new Promise((res) => process.stdout.end(res))
    if (!r.completa) avisar(`faltan consultas: ${r.pendientes.join(', ')}`)
    avisar(`ESTADO=${r.completa ? 'COMPLETA' : 'PARCIAL'}`)
    avisar(`MANIFEST_SHA256=${r.manifiestoSha256}`)
  } catch (err) {
    avisar(`ERROR: ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal()
