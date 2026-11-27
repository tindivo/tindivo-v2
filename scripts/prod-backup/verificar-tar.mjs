#!/usr/bin/env node
// Copia de producción P0.5: comprueba el tar de Storage (parte 2) que llega ya descifrado por stdin.
// No escribe nada en disco: solo cuenta, compara sha256 y lo dice. Sus mensajes son fijos o cifras: nunca
// copian contenido del tar.
import { verificarTar } from './tar-lib.mjs'

const entero = (v) => (Number.isSafeInteger(v) ? v : '?')

try {
  const r = await verificarTar(process.stdin)
  const d = r.datos
  if (d.tipo === 'storage') {
    const s = d.resumen ?? {}
    console.error(
      `[verificar] storage: ${entero(s.ok)} de ${entero(s.listados)} objetos, ${entero(s.bytes)} bytes; no encontrados: ${entero(s.no_encontrados)}; nombre no válido: ${entero(s.nombre_no_valido)}; tamaño distinto: ${entero(s.tamano_distinto)}; sin huella: ${entero(s.sin_huella)}; huella distinta: ${entero(s.huella_distinta)}`,
    )
  } else {
    throw new Error('el tar no es de Storage (falta tipo «storage» en el manifiesto)')
  }
  // Vínculo con la parte 1 y origen: solo formas fijas (64 hex; una URL de esquema y host). Si no, no se imprimen y
  // el host, que exige ambos, rechaza la copia.
  if (typeof d.lista_sha256 === 'string' && /^[0-9a-f]{64}$/.test(d.lista_sha256)) console.error(`[verificar] LISTA_SHA256=${d.lista_sha256}`)
  if (typeof d.base_manifiesto_sha256 === 'string' && /^[0-9a-f]{64}$/.test(d.base_manifiesto_sha256)) {
    console.error(`[verificar] BASE_MANIFIESTO=${d.base_manifiesto_sha256}`)
  }
  if (typeof d.origen === 'string' && /^https?:[/][/][a-z0-9.-]+(:[0-9]{1,5})?$/.test(d.origen)) console.error(`[verificar] ORIGEN=${d.origen}`)
  console.error(`[verificar] ESTADO=${d.completa === true ? 'COMPLETA' : 'PARCIAL'}`)
  console.error(`[verificar] MANIFEST_SHA256=${r.manifiestoSha256}`)
  console.error('[verificar] manifiesto y sha256 de cada entrada: OK')
} catch (err) {
  console.error(`[verificar] ERROR: ${err.message}`)
  process.exit(1)
}
