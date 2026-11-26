#!/usr/bin/env node
// Copia de producción P0.5, parte 3: inventario de la configuración que NO vive en la base
// (Auth, Edge Functions, nombres de secretos, API, red). Solo GET a la API de gestión de Supabase.
//
//   stdout  un tar con un JSON por consulta (va directo a gpg)
//   stderr  qué consultas respondieron, sin contenido, y ESTADO=COMPLETA o ESTADO=PARCIAL
//
// El token personal llega por TINDIVO_MGMT_TOKEN. Los valores secretos se tachan ANTES de empaquetar:
// el inventario dice que existen, no cuánto valen.
import { pathToFileURL } from 'node:url'
import { soloGet, tomarCredencial } from './solo-get.mjs'
import { crearEscritorTar } from './tar-lib.mjs'

const REF_PROD = 'zpnipajgwfthxhdtzhly'
const API = 'https://api.supabase.com'
export const TACHADO = '[TACHADO: hay un valor]'
const CLAVE_SENSIBLE =
  /(secret|password|passwd|pass$|_pass_|token|private|credential|jwt|otp|(^|_)keys?($|_)|api_?key|hash|salt|dsn|connection_?string)/i
// Claves que suenan a secreto pero solo dicen cómo está configurado algo (una URI de hook, un límite, un interruptor).
const CLAVE_DE_CONFIGURACION =
  /(_uri|_url|_enabled|_characters|_length|_exp|_id|_algorithm|_interval|_period|_limit|_count|_size|_seconds)$|^rate_limit_/i
// Texto que lleva una credencial aunque su clave no lo sugiera: usuario:contraseña@ o un parámetro con nombre de secreto.
const TEXTO_CON_CREDENCIAL = /\/\/[^/\s@]+:[^/\s@]*@|[^\s@/:]+:[^\s@/:]+@[^\s@]+|[?&;](password|passwd|pass|pwd|token|secret|key|apikey|api_key|access_key)=/i
const enSnake = (clave) => clave.replace(/([a-z0-9])([A-Z])/g, '$1_$2')

// [nombre, sufijo, obligatoria]. Una consulta obligatoria que no responde 200 deja el inventario PARCIAL.
// En una opcional, solo un 404 («este proyecto no tiene eso») cuenta como «no aplica»; cualquier otro fallo, PARCIAL.
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

/** Si el texto es una URL con usuario, contraseña, parámetros o fragmento, deja solo origen y ruta. */
export function limpiarUrl(texto) {
  if (TEXTO_CON_CREDENCIAL.test(texto) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) return TACHADO
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) return texto
  let url
  try {
    url = new URL(texto)
  } catch {
    return TACHADO
  }
  if (!url.username && !url.password && !url.search && !url.hash) return texto
  return `${url.protocol}//${url.host}${url.pathname} [credenciales o parámetros tachados]`
}

/**
 * Tacha todo valor de texto cuya clave suene a secreto. La sospecha se hereda hacia abajo: dentro de una clave
 * sensible se tacha todo texto, se llame como se llame. Deja números, booleanos y vacíos (dicen si está configurado).
 */
export function tachar(valor, clave = '', heredado = false) {
  const k = enSnake(clave)
  const sensible = heredado || (CLAVE_SENSIBLE.test(k) && !CLAVE_DE_CONFIGURACION.test(k))
  if (Array.isArray(valor)) return valor.map((v) => tachar(v, '', sensible))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, tachar(v, k, sensible)]))
  }
  // Bajo una clave sensible también se tacha un número (una contraseña numérica); los booleanos y vacíos se dejan.
  if (typeof valor === 'number') return sensible ? TACHADO : valor
  if (typeof valor !== 'string' || valor === '') return valor
  return sensible ? TACHADO : limpiarUrl(valor)
}

/** De la lista de secretos de las funciones solo se conserva el nombre. */
export function soloNombres(lista) {
  if (!Array.isArray(lista)) throw new Error('forma inesperada')
  return lista.map((s) => ({ name: typeof s?.name === 'string' ? s.name : null, updated_at: s?.updated_at ?? null }))
}

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
    // Los mensajes de error son fijos: nunca se copia el texto de una respuesta ni el de un error de análisis.
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
        if (json === undefined || json === null || typeof json !== 'object') {
          estado = 'respuesta_no_valida'
        } else {
          try {
            registro.datos = nombre === 'secretos-nombres' ? soloNombres(json) : tachar(json)
            estado = 'ok'
          } catch {
            estado = 'respuesta_no_valida'
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
  if (estados.proyecto !== 'ok' || estados.auth !== 'ok') {
    throw new Error('la API de gestión no devolvió el proyecto o la configuración de Auth (¿token sin permiso o vencido?)')
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
