#!/usr/bin/env node
// Copia de producción P0.5, parte 2: baja los archivos de Storage y los entrega como un tar por stdout.
//
//   stdin   una línea JSON por objeto de storage.objects: la lista que la parte 1 tomó en SU snapshot
//           (storage-objetos.jsonl, que copia.sh saca de 1-base.tar.gpg descifrándolo hacia una tubería)
//   stdout  el tar (va directo a gpg: nada en claro toca el disco)
//   stderr  el avance, en cifras: sin nombres de archivo y sin la credencial; y ESTADO=COMPLETA o ESTADO=PARCIAL
//
// COMPLETA solo si se bajó cada objeto de la lista y con el tamaño que declara la base. Cualquier objeto que
// falte, que no se pueda pedir o que mida distinto deja la parte PARCIAL: el tar se entrega, pero no es un respaldo
// completo de Storage y así queda dicho en el manifiesto, en el registro y en el resumen.
//
// La service role llega por la variable TINDIVO_STORAGE_KEY y solo viaja en la cabecera de un GET.
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { soloGet, tomarCredencial } from './solo-get.mjs'
import { crearEscritorTar } from './tar-lib.mjs'

const REF_PROD = 'zpnipajgwfthxhdtzhly'
const URLS = {
  prod: [`https://${REF_PROD}.supabase.co`],
  local: ['http://127.0.0.1:54321', 'http://localhost:54321'],
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class NombreNoValido extends Error {
  constructor() {
    super('nombre de objeto no válido')
  }
}

export function validarBase(destino, url) {
  const permitidas = URLS[destino]
  if (!permitidas) throw new Error(`destino desconocido: ${destino}`)
  if (!permitidas.includes(url)) throw new Error(`la URL de Storage no corresponde al destino «${destino}»`)
  return url
}

export function urlDeObjeto(base, bucket, nombre) {
  // Un tramo «.» o «..» cambiaría la ruta al normalizarse la URL: ese nombre no se pide.
  if ([bucket, ...nombre.split('/')].some((t) => t === '' || t === '.' || t === '..')) throw new NombreNoValido()
  const ruta = nombre.split('/').map(encodeURIComponent).join('/')
  const url = new URL(`${base}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${ruta}`)
  if (url.origin !== new URL(base).origin) throw new Error('la URL del objeto sale del host de Storage')
  return url
}

/** Normaliza un ETag (sin el prefijo débil ni las comillas). Vacío si no es un texto corto y simple. */
export function huella(etag) {
  if (typeof etag !== 'string') return ''
  const limpio = etag.replace(/^W\//, '').replace(/^"|"$/g, '')
  return /^[A-Za-z0-9_+/=.:-]{8,128}$/.test(limpio) ? limpio : ''
}

function rutaEnTar(obj, n) {
  const bucket =
    String(obj.bucket)
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 48) || '_'
  return UUID.test(obj.id) ? `objetos/${bucket}/${obj.id.toLowerCase()}` : `objetos/${bucket}/n${n}`
}

/**
 * @param {{ base: string, clave: string, lineas: AsyncIterable<string>, salida: import('node:stream').Writable,
 *   avisar?: (m: string) => void, fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void> }} p
 */
export async function copiarStorage({ base, clave, lineas, salida, avisar = () => {}, fetchImpl, esperar }) {
  const tar = crearEscritorTar(salida)
  const cabeceras = { authorization: `Bearer ${clave}`, apikey: clave }
  const objetos = []
  const resumen = {
    listados: 0,
    ok: 0,
    bajados: 0,
    no_encontrados: 0,
    nombre_no_valido: 0,
    tamano_distinto: 0,
    sin_huella: 0,
    huella_distinta: 0,
    bytes: 0,
  }
  for await (const linea of lineas) {
    if (!linea.trim()) continue
    resumen.listados++
    let obj
    try {
      obj = JSON.parse(linea)
    } catch {
      throw new Error(`la línea ${resumen.listados} de la lista de objetos no es JSON`)
    }
    const registro = {
      bucket: obj.bucket,
      id: obj.id,
      nombre: obj.name,
      mimetype: obj.mimetype ?? null,
      bytes_declarados: obj.size ?? null,
      huella_declarada: huella(obj.etag) || null,
      actualizado: obj.updated_at ?? null,
    }
    let url
    try {
      url = urlDeObjeto(base, String(obj.bucket), String(obj.name))
    } catch (err) {
      if (!(err instanceof NombreNoValido)) throw err
      resumen.nombre_no_valido++
      objetos.push({ ...registro, estado: 'nombre_no_valido' })
      continue
    }
    let status
    let cuerpo
    let etag
    try {
      ;({ status, cuerpo, etag } = await soloGet(url, cabeceras, { fetchImpl, esperar }))
    } catch (err) {
      throw new Error(`objeto ${resumen.listados} (id ${obj.id}): ${err.message}`)
    }
    if (status === 200) {
      const ruta = rutaEnTar(obj, resumen.listados)
      await tar.agregar(ruta, cuerpo)
      // Un objeto solo cuenta como «ok» si lo bajado es la MISMA versión que describe la base en el snapshot:
      // mismo tamaño y misma huella (el ETag que Storage guardó en los metadatos frente al ETag de la respuesta).
      // Si alguien lo sustituyó después de la foto —aunque mida lo mismo— la huella cambia. Sin tamaño o sin huella
      // con qué comparar no se puede acreditar la correspondencia. En todos esos casos la parte queda PARCIAL.
      const huellaBase = huella(obj.etag)
      const huellaServida = huella(etag)
      let estado = 'ok'
      if (obj.size == null || Number(obj.size) !== cuerpo.length) estado = 'tamano_distinto'
      else if (!huellaBase || !huellaServida) estado = 'sin_huella'
      else if (huellaBase !== huellaServida) estado = 'huella_distinta'
      if (estado === 'ok') resumen.ok++
      else resumen[estado]++
      resumen.bajados++
      resumen.bytes += cuerpo.length
      objetos.push({ ...registro, estado, ruta, bytes: cuerpo.length })
    } else if (status === 404 || (status === 400 && /not.?found/i.test(cuerpo.toString('utf8', 0, 300)))) {
      resumen.no_encontrados++
      objetos.push({ ...registro, estado: 'no_encontrado' })
    } else {
      throw new Error(`Storage respondió HTTP ${status} en el objeto ${resumen.listados} (id ${obj.id})`)
    }
    if (resumen.listados % 50 === 0) avisar(`${resumen.listados} objetos vistos, ${resumen.bytes} bytes`)
  }
  if (resumen.listados > 0 && resumen.bajados === 0) {
    throw new Error(`se listaron ${resumen.listados} objetos y no se pudo bajar ninguno`)
  }
  const completa = resumen.ok === resumen.listados
  const manifiestoSha256 = await tar.cerrar({
    tipo: 'storage',
    origen: base,
    tomado_utc: new Date().toISOString(),
    completa,
    resumen,
    objetos,
  })
  return { resumen, completa, manifiestoSha256 }
}

async function principal() {
  const [destino, base] = process.argv.slice(2)
  const avisar = (m) => console.error(`[storage] ${m}`)
  try {
    validarBase(destino, base)
    const clave = tomarCredencial('TINDIVO_STORAGE_KEY')
    const lineas = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
    const { resumen, completa, manifiestoSha256 } = await copiarStorage({ base, clave, lineas, salida: process.stdout, avisar })
    await new Promise((r) => process.stdout.end(r))
    avisar(
      `RESUMEN listados=${resumen.listados} ok=${resumen.ok} no_encontrados=${resumen.no_encontrados} nombre_no_valido=${resumen.nombre_no_valido} tamano_distinto=${resumen.tamano_distinto} sin_huella=${resumen.sin_huella} huella_distinta=${resumen.huella_distinta} bytes=${resumen.bytes}`,
    )
    avisar(`ESTADO=${completa ? 'COMPLETA' : 'PARCIAL'}`)
    avisar(`MANIFEST_SHA256=${manifiestoSha256}`)
  } catch (err) {
    avisar(`ERROR: ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal()
