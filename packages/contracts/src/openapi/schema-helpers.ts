import { z } from 'zod'

/**
 * Enum de RESPUESTA abierto: se documenta como texto con los valores conocidos.
 *
 * Un `enum` estricto en el OpenAPI hace que un cliente generado (Swift, Kotlin)
 * falle al decodificar en cuanto la base añade un valor nuevo —`pickup_local`
 * llegó así a `business_primary_capability`—, y una app instalada no se puede
 * recompilar. Las apps tratan un valor desconocido como «otro» (estándar API-3,
 * Docs/arquitectura/05-estandares.md). En las PETICIONES el enum sí es cerrado:
 * ahí manda el servidor.
 */
export function openEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.string().meta({
    'x-known-values': [...values],
    description: `Valores conocidos: ${values.join(', ')}. Puede llegar uno nuevo; trátalo como desconocido.`,
  })
}

/**
 * Dinero tal como lo devuelven HOY las rutas heredadas: número JSON que sale de
 * un `numeric(10,2)`. Los campos NUEVOS lo mandarán como cadena decimal (D-39);
 * los existentes no cambian de tipo en silencio.
 */
export const legacyMoney = z.number().meta({
  description:
    'Soles como número JSON (numeric(10,2) en la base). Campo heredado: no cambia de tipo.',
})

/**
 * UUID en una RESPUESTA: `format: uuid` sin el patrón que añade `z.uuid()`. El
 * servidor ya garantiza la forma; el patrón solo engorda el cliente generado.
 */
export const uuidOut = z.string().meta({ format: 'uuid' })
