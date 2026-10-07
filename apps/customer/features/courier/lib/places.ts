/**
 * La referencia de un punto que es un lugar del pueblo (`map_landmarks`): su
 * propio nombre, que es como lo ubica el motorizado.
 *
 * La referencia necesita ≥ 5 letras (`co_origin_reference_len`): un nombre
 * corto («Ojo») se completa para no fallar al final del pedido.
 */
export function placeReference(name: string): string {
  const n = name.trim()
  return n.length >= 5 ? n : `Frente a ${n}`
}
