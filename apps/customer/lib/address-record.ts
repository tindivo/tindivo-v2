import type { AddressValue } from '@/lib/address-validation'

/**
 * Reglas de la FILA guardada de una dirección: cuál manda y cómo se sella su
 * punto en el mapa.
 *
 * Es el hermano de `address-validation.ts`, que son las reglas del FORMULARIO
 * —qué se puede escribir y cuándo se deja guardar—. Aquí no se valida nada: se
 * contestan las dos preguntas que solo tienen sentido sobre filas que YA
 * existen, y que las cinco pantallas que tocan direcciones venían contestando
 * cada una por su cuenta, equivocándose cada una en algo distinto.
 */

/**
 * LA INVARIANTE: un usuario con direcciones tiene EXACTAMENTE una
 * predeterminada.
 *
 * El índice único parcial `customer_addresses_default_per_user_idx` garantiza
 * el «como mucho una». El «al menos una» no lo garantiza nadie en la base —es
 * el lado que dejó a dos usuarios de veintisiete sin predeterminada y que la
 * 0203 tuvo que arreglar a mano—, así que lo sostiene el código: estas dos
 * funciones y las dos rutas de alta.
 */
export interface DefaultableAddress {
  id: string
  is_default: boolean
}

/**
 * La dirección que manda. Nunca `null` si hay al menos una.
 *
 * El `?? addresses[0]` NO es la regla, es la red: si la invariante se sostiene
 * nunca se usa. Existe porque `cart-business-gate` no la tenía y era justo el
 * que arma el mensaje de WhatsApp al negocio — a los dos usuarios sin
 * predeterminada les mandaba el pedido SIN dirección. Por eso no importa qué
 * fila caiga primero cuando la red actúa: cualquiera es mejor que ninguna.
 */
export function pickDefaultAddress<T extends DefaultableAddress>(
  addresses: readonly T[],
): T | null {
  return addresses.find((a) => a.is_default) ?? addresses[0] ?? null
}

/**
 * Quién hereda la predeterminada al borrar `removedId`. `null` = nadie tiene
 * que heredar (o no queda nadie).
 *
 * Borrar era un `delete` a secas: quien tuviera dos direcciones y borrase la
 * predeterminada quedaba con direcciones y ninguna marcada — exactamente el
 * estado que la 0203 acababa de reparar, reabierto a dos toques desde la hoja
 * de edición.
 *
 * Mira a los supervivientes y no a la que se va: así también cura un usuario
 * que YA estuviera sin predeterminada antes de este borrado, en vez de
 * limitarse a no empeorarlo.
 */
export function heirAfterRemoving<T extends DefaultableAddress>(
  addresses: readonly T[],
  removedId: string,
): T | null {
  const survivors = addresses.filter((a) => a.id !== removedId)
  if (survivors.length === 0) return null
  if (survivors.some((a) => a.is_default)) return null
  return survivors[0] ?? null
}

/** Lo que la fila guarda del punto en el mapa (ver migración 0202). */
export interface StoredLocation {
  coordinates_lat: number | null
  coordinates_lng: number | null
  location_confirmed_at: string | null
  location_accuracy_m: number | null
}

export interface LocationSeal {
  location_confirmed_at: string
  location_accuracy_m: number | null
}

/**
 * El sello del punto: cuándo lo confirmó una persona y con cuántos metros de
 * precisión lo dio el sensor.
 *
 * POR QUÉ NO SE RESELLA SIEMPRE. La hoja del perfil escribía
 * `location_confirmed_at: now()` y `location_accuracy_m: <estado local>` en
 * CADA guardado. Como la precisión no se rehidrataba —no se leía siquiera de la
 * base—, cambiar la etiqueta de «Casa» a «Trabajo» convertía un GPS de ±8 m en
 * un `NULL`, que por el convenio de la 0202 significa «el pin se puso a mano».
 * O sea: el guardado destruía justo la columna que la 0202 creó para poder
 * distinguir una medida de una decisión.
 *
 * La regla es que el sello lo mueve el PUNTO, no el formulario. Si la
 * coordenada no cambió, el sello viejo sigue siendo el bueno y se copia tal
 * cual; si cambió —o si no había—, se sella ahora con lo que traiga el mapa.
 *
 * `nowIso` entra como argumento y no se lee del reloj aquí para que esto se
 * pueda probar sin congelar el tiempo.
 */
export function sealLocation(
  previous: StoredLocation | null,
  value: AddressValue,
  nowIso: string,
): LocationSeal {
  const nuevo: LocationSeal = {
    location_confirmed_at: nowIso,
    location_accuracy_m: value.accuracyM,
  }
  if (
    previous == null ||
    previous.location_confirmed_at == null ||
    previous.coordinates_lat == null ||
    previous.coordinates_lng == null ||
    value.coords == null
  ) {
    return nuevo
  }
  const mismoPunto =
    Number(previous.coordinates_lat) === value.coords.lat &&
    Number(previous.coordinates_lng) === value.coords.lng
  return mismoPunto
    ? {
        location_confirmed_at: previous.location_confirmed_at,
        location_accuracy_m: previous.location_accuracy_m,
      }
    : nuevo
}
