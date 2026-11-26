#!/usr/bin/env node
// Copia de producción P0.5: comprueba un tar (Storage o configuración) que llega ya descifrado por stdin.
// No escribe nada en disco: solo cuenta, compara sha256 y lo dice.
import { verificarTar } from './tar-lib.mjs'

try {
  const r = await verificarTar(process.stdin)
  const d = r.datos
  if (d.tipo === 'storage') {
    console.error(
      `[verificar] storage: ${d.resumen.ok} objetos, ${d.resumen.bytes} bytes; no encontrados: ${d.resumen.no_encontrados}`,
    )
  } else {
    console.error(`[verificar] ${d.tipo ?? 'tar'}: ${r.entradas} entradas, ${r.bytes} bytes`)
  }
  console.error(`[verificar] MANIFEST_SHA256=${r.manifiestoSha256}`)
  console.error('[verificar] manifiesto y sha256 de cada entrada: OK')
} catch (err) {
  console.error(`[verificar] ERROR: ${err.message}`)
  process.exit(1)
}
