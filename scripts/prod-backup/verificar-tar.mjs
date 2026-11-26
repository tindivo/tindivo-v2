#!/usr/bin/env node
// Copia de producción P0.5: comprueba un tar (Storage o configuración) que llega ya descifrado por stdin.
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
  } else if (d.tipo === 'config') {
    const pendientes = Array.isArray(d.pendientes) ? d.pendientes.length : '?'
    console.error(`[verificar] config: ${r.entradas} consultas guardadas; sin respuesta válida: ${pendientes}`)
  } else {
    console.error(`[verificar] tar: ${r.entradas} entradas, ${r.bytes} bytes`)
  }
  console.error(`[verificar] ESTADO=${d.completa === true ? 'COMPLETA' : 'PARCIAL'}`)
  console.error(`[verificar] MANIFEST_SHA256=${r.manifiestoSha256}`)
  console.error('[verificar] manifiesto y sha256 de cada entrada: OK')
} catch (err) {
  console.error(`[verificar] ERROR: ${err.message}`)
  process.exit(1)
}
