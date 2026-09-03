'use client'

import { type SavedAddress, sealLocation, shouldBecomeDefault } from '@/lib/address-record'
import type { AddressValue } from '@/lib/address-validation'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * Qué hacer con `is_default` al guardar.
 *
 *   · `'auto'` — lo decide `shouldBecomeDefault` con lo que hay en la base:
 *     manda solo si no hay nadie mandando. Es lo que quieren las altas que no
 *     preguntan (checkout y onboarding).
 *   · `true` / `false` — lo dice quien llama. Solo el perfil, que tiene un
 *     interruptor a la vista. Marcar en firme despeja a las demás.
 *   · `'keep'` — no se toca la columna. Es lo que quiere una edición: cambiar
 *     la referencia de tu casa no es decir nada sobre cuál manda.
 */
export type DefaultDecision = boolean | 'auto' | 'keep'

export interface SaveAddressInput {
  userId: string
  /** La fila que se está editando, o `null` en un alta. */
  previous: SavedAddress | null
  value: AddressValue
  makeDefault: DefaultDecision
}

/**
 * `ok` es un discriminante de verdad y no un `error?: undefined`: con el
 * segundo, TypeScript no puede descartar la rama de fallo mirando
 * `if (res.error)` —un `string` vacío también es falso— y el `id` seguía
 * saliendo como `string | undefined` en la rama buena.
 */
export type SaveAddressResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Guardar una dirección: el único sitio donde se escribe `customer_addresses`
 * desde el app del cliente.
 *
 * POR QUÉ EXISTE. Esto estaba escrito en tres pantallas —perfil, checkout y
 * onboarding— y las tres se equivocaban en algo distinto: una robaba la
 * predeterminada, otra no ponía ninguna, y una tercera destruía la medida del
 * GPS al guardar. Cada arreglo se aplicaba a la copia que se estaba mirando y
 * la siguiente auditoría encontraba la misma clase de fallo en la de al lado.
 * Añadir la edición al checkout iba a ser la cuarta copia, así que primero se
 * junta el guardado en una función y después se usa.
 *
 * Devuelve `{ error }` en vez de lanzar: quien llama tiene que enseñar el
 * mensaje, no tragárselo. Ese `catch` mudo es el que dejaba al cliente pulsando
 * un botón que dejaba de girar y no hacía nada.
 */
export async function saveAddressRow(input: SaveAddressInput): Promise<SaveAddressResult> {
  const supabase = getSupabaseBrowser()

  /** `null` = no se toca la columna. */
  let predeterminada: boolean | null
  if (input.makeDefault === 'keep') {
    predeterminada = null
  } else if (input.makeDefault === 'auto') {
    const { data: existentes, error } = await supabase
      .from('customer_addresses')
      .select('id,is_default')
      .eq('user_id', input.userId)
    if (error) return { ok: false, error: error.message }
    predeterminada = shouldBecomeDefault(existentes ?? [])
  } else {
    predeterminada = input.makeDefault
  }

  // Despejar SOLO cuando se marca en firme. Con `'auto'` no hace falta: esa
  // rama solo devuelve `true` cuando no hay ninguna marcada, así que el índice
  // único parcial nunca llega a ver dos.
  if (predeterminada === true && input.makeDefault !== 'auto') {
    const { error } = await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('user_id', input.userId)
    if (error) return { ok: false, error: error.message }
  }

  const payload = {
    label: input.value.label,
    // La columna es nullable y `''` no es una calle: se guarda NULL, que es lo
    // que ya hacia el alta del onboarding y lo que leen `isLineOk` y las
    // tarjetas. En la practica no ocurre —`canSaveAddress` exige un minimo—,
    // pero es la unica forma en que las tres pantallas escriben lo mismo.
    line: input.value.line.trim() || null,
    reference: input.value.reference.trim(),
    coordinates_lat: input.value.coords?.lat ?? null,
    coordinates_lng: input.value.coords?.lng ?? null,
    // El sello lo mueve el PUNTO, no el formulario: si la coordenada no cambió,
    // la confirmación y los metros del sensor que ya había siguen siendo los
    // buenos.
    ...sealLocation(input.previous, input.value, new Date().toISOString()),
    ...(predeterminada === null ? {} : { is_default: predeterminada }),
  }

  if (input.previous) {
    const { error } = await supabase
      .from('customer_addresses')
      .update(payload)
      .eq('id', input.previous.id)
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: input.previous.id }
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .insert({ ...payload, user_id: input.userId })
    .select('id')
    .single()
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'No pudimos guardar la dirección. Intenta de nuevo.',
    }
  }
  return { ok: true, id: data.id }
}
