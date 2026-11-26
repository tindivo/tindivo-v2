// Copia de producción P0.5: tar mínimo (ustar) para empaquetar en memoria, sin tocar el disco.
// Cada tar termina con MANIFEST.json: la lista de entradas con su sha256, para verificar tras descifrar.
import { createHash } from 'node:crypto'

const BLOQUE = 512
export const NOMBRE_MANIFIESTO = 'MANIFEST.json'

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function cabecera(ruta, bytes) {
  const nombre = Buffer.from(ruta, 'utf8')
  if (nombre.length === 0 || nombre.length > 100) throw new Error(`ruta de tar inválida (${nombre.length} bytes)`)
  if (ruta.startsWith('/') || ruta.split('/').includes('..')) throw new Error('ruta de tar insegura')
  const h = Buffer.alloc(BLOQUE)
  nombre.copy(h, 0)
  h.write('0000600\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write(`${bytes.toString(8).padStart(11, '0')}\0`, 124, 'ascii')
  h.write('00000000000\0', 136, 'ascii')
  h.write('        ', 148, 'ascii')
  h.write('0', 156, 'ascii')
  h.write('ustar\0', 257, 'ascii')
  h.write('00', 263, 'ascii')
  let suma = 0
  for (const b of h) suma += b
  h.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148, 'ascii')
  return h
}

/** Escribe un tar en `salida` (un Writable). `agregar` respeta la contrapresión. */
export function crearEscritorTar(salida) {
  const entradas = []
  const escribir = (buf) =>
    new Promise((resolve, reject) => {
      salida.write(buf, (err) => (err ? reject(err) : resolve()))
    })
  async function entrada(ruta, contenido) {
    await escribir(cabecera(ruta, contenido.length))
    if (contenido.length > 0) await escribir(contenido)
    const resto = contenido.length % BLOQUE
    if (resto !== 0) await escribir(Buffer.alloc(BLOQUE - resto))
  }
  return {
    async agregar(ruta, contenido) {
      if (ruta === NOMBRE_MANIFIESTO) throw new Error('nombre reservado')
      if (entradas.some((e) => e.ruta === ruta)) throw new Error(`entrada repetida: ${ruta}`)
      await entrada(ruta, contenido)
      entradas.push({ ruta, bytes: contenido.length, sha256: sha256(contenido) })
    },
    /** Cierra el tar con el manifiesto y devuelve el sha256 del manifiesto. */
    async cerrar(datos = {}) {
      const manifiesto = Buffer.from(`${JSON.stringify({ ...datos, entradas }, null, 1)}\n`, 'utf8')
      await entrada(NOMBRE_MANIFIESTO, manifiesto)
      await escribir(Buffer.alloc(BLOQUE * 2))
      return sha256(manifiesto)
    },
  }
}

/** Lee un tar de un iterable asíncrono de Buffers y lo comprueba contra su MANIFEST.json. */
export async function verificarTar(entrada) {
  let pendiente = Buffer.alloc(0)
  const vistos = new Map()
  let manifiesto = null
  let actual = null
  let terminado = false
  for await (const trozo of entrada) {
    pendiente = pendiente.length ? Buffer.concat([pendiente, trozo]) : trozo
    while (!terminado) {
      if (actual === null) {
        if (pendiente.length < BLOQUE) break
        const h = pendiente.subarray(0, BLOQUE)
        pendiente = pendiente.subarray(BLOQUE)
        if (h.every((b) => b === 0)) {
          terminado = true
          break
        }
        if (h.toString('ascii', 257, 262) !== 'ustar') throw new Error('no es un tar de esta herramienta')
        const ruta = h.toString('utf8', 0, 100).replace(/\0.*$/, '')
        const bytes = Number.parseInt(h.toString('ascii', 124, 135), 8)
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`tamaño inválido en ${ruta}`)
        actual = { ruta, bytes, hash: createHash('sha256'), leidos: 0, trozos: ruta === NOMBRE_MANIFIESTO ? [] : null }
      }
      const falta = actual.bytes - actual.leidos
      if (falta > 0) {
        if (pendiente.length === 0) break
        const parte = pendiente.subarray(0, Math.min(falta, pendiente.length))
        actual.hash.update(parte)
        if (actual.trozos) actual.trozos.push(parte)
        actual.leidos += parte.length
        pendiente = pendiente.subarray(parte.length)
        if (actual.leidos < actual.bytes) break
      }
      const relleno = (BLOQUE - (actual.bytes % BLOQUE)) % BLOQUE
      if (pendiente.length < relleno) break
      pendiente = pendiente.subarray(relleno)
      const digest = actual.hash.digest('hex')
      if (actual.ruta === NOMBRE_MANIFIESTO) {
        if (manifiesto) throw new Error('hay más de un manifiesto')
        manifiesto = { sha256: digest, json: JSON.parse(Buffer.concat(actual.trozos).toString('utf8')) }
      } else {
        if (manifiesto) throw new Error(`entrada después del manifiesto: ${actual.ruta}`)
        if (vistos.has(actual.ruta)) throw new Error(`entrada repetida: ${actual.ruta}`)
        vistos.set(actual.ruta, { bytes: actual.bytes, sha256: digest })
      }
      actual = null
    }
  }
  if (actual !== null || !terminado) throw new Error('el tar está cortado')
  if (!manifiesto) throw new Error('el tar no trae MANIFEST.json')
  const listadas = manifiesto.json.entradas
  if (!Array.isArray(listadas)) throw new Error('manifiesto sin lista de entradas')
  for (const e of listadas) {
    const v = vistos.get(e.ruta)
    if (!v) throw new Error(`falta la entrada ${e.ruta}`)
    if (v.sha256 !== e.sha256 || v.bytes !== e.bytes) throw new Error(`no coincide el sha256 de ${e.ruta}`)
  }
  if (listadas.length !== vistos.size) throw new Error('hay entradas que el manifiesto no lista')
  const bytes = listadas.reduce((s, e) => s + e.bytes, 0)
  return { entradas: listadas.length, bytes, manifiestoSha256: manifiesto.sha256, datos: manifiesto.json }
}
