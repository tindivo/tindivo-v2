#!/usr/bin/env node
// Copia de producción P0.5, parte 3: inventario de la configuración que NO vive en la base
// (Auth, Edge Functions, nombres de secretos, API, red). Solo GET a la API de gestión de Supabase.
//
//   stdout  un tar con un JSON por consulta (va directo a gpg)
//   stderr  qué consultas respondieron, sin contenido
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

export const CONSULTAS = [
  ['proyecto', ''],
  ['auth', '/config/auth'],
  ['edge-functions', '/functions'],
  ['secretos-nombres', '/secrets'],
  ['postgrest', '/postgrest'],
  ['storage', '/config/storage'],
  ['pooler', '/config/database/pooler'],
  ['restricciones-de-red', '/network-restrictions'],
  ['ssl-obligatorio', '/ssl-enforcement'],
  ['respaldos-de-la-plataforma', '/database/backups'],
]

/** Tacha todo valor de texto cuya clave suene a secreto. Deja números, booleanos y vacíos (dicen si está configurado). */
export function tachar(valor, clave = '') {
  if (Array.isArray(valor)) return valor.map((v) => tachar(v, clave))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, tachar(v, k)]))
  }
  if (typeof valor === 'string' && valor !== '' && CLAVE_SENSIBLE.test(clave)) return TACHADO
  return valor
}

/** De la lista de secretos de las funciones solo se conserva el nombre. */
export function soloNombres(lista) {
  if (!Array.isArray(lista)) return { aviso: 'respuesta inesperada', tipo: typeof lista }
  return lista.map((s) => ({ name: s?.name ?? null, updated_at: s?.updated_at ?? null }))
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
  for (const [nombre, sufijo] of CONSULTAS) {
    const url = new URL(`${API}/v1/projects/${ref}${sufijo}`)
    let registro
    try {
      const { status, cuerpo } = await soloGet(url, cabeceras, { fetchImpl, esperar, timeoutMs: 30_000 })
      estados[nombre] = status
      if (status === 200) {
        const json = JSON.parse(cuerpo.toString('utf8'))
        const datos = nombre === 'secretos-nombres' ? soloNombres(json) : tachar(json)
        registro = { consulta: url.pathname, status, datos }
      } else {
        registro = { consulta: url.pathname, status, datos: null }
      }
    } catch (err) {
      estados[nombre] = 'error'
      registro = { consulta: url.pathname, status: null, error: err.message, datos: null }
    }
    avisar(`${nombre}: ${estados[nombre]}`)
    await tar.agregar(`config/${nombre}.json`, Buffer.from(`${JSON.stringify(registro, null, 1)}\n`, 'utf8'))
  }
  if (estados.proyecto !== 200 || estados.auth !== 200) {
    throw new Error('la API de gestión no devolvió el proyecto o la configuración de Auth (¿token sin permiso o vencido?)')
  }
  const manifiestoSha256 = await tar.cerrar({ tipo: 'config', ref, tomado_utc: new Date().toISOString(), estados })
  return { estados, manifiestoSha256 }
}

async function principal() {
  const avisar = (m) => console.error(`[config] ${m}`)
  try {
    const token = tomarCredencial('TINDIVO_MGMT_TOKEN')
    const { manifiestoSha256 } = await inventariar({ ref: process.argv[2], token, salida: process.stdout, avisar })
    await new Promise((r) => process.stdout.end(r))
    avisar(`MANIFEST_SHA256=${manifiestoSha256}`)
  } catch (err) {
    avisar(`ERROR: ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal()
