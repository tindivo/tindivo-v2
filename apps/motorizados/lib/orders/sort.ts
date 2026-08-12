/**
 * Orden de la bandeja "En espera".
 *
 * Vive fuera del componente para poder probarlo: es una regla que ya se rompió
 * una vez —ordenaba por `created_at` mientras la tarjeta enseñaba un reloj— y
 * el síntoma no era un fallo, era una lista que "no se entendía".
 */

/** Lo mínimo que hace falta para ordenar. `BoardOrder` lo satisface. */
export interface SortableOrder {
  estimated_ready_at: string | null
  created_at: string
}

/**
 * POR EL RELOJ, QUE ES LO QUE LA TARJETA ENSEÑA.
 *
 * `created_at` NO coincide con el reloj: cada pedido lleva su propio
 * `prep_time_minutes`, así que uno pedido antes puede estar listo después.
 * Ordenando por antigüedad, la lista mostraba contadores en secuencias como
 * `03:00 · 07:00 · 02:00` y no había forma de deducir la regla mirándola.
 *
 * Con la ETA ascendente los contadores bajan monótonos: primero el que más se
 * pasó, luego el que menos falta. Y es UN SOLO criterio — los pasados de cero
 * quedan arriba por aritmética, sin grupo aparte.
 *
 * NO DEPENDE DE `now`, y eso importa: el criterio viejo reordenaba la lista
 * cada vez que un pedido cruzaba el cero, moviendo las tarjetas bajo el pulgar
 * del motorizado mientras las miraba. Este orden solo cambia cuando entra o
 * sale un pedido.
 *
 * Sin reloj no hay nada que comparar: esos van al final, entre ellos por
 * antigüedad.
 */
export function byReadyClock<T extends SortableOrder>(orders: readonly T[]): T[] {
  return [...orders].sort((a, b) => {
    const ea = a.estimated_ready_at ? Date.parse(a.estimated_ready_at) : null
    const eb = b.estimated_ready_at ? Date.parse(b.estimated_ready_at) : null

    if (ea == null || eb == null) {
      if (ea !== eb) return ea == null ? 1 : -1
    } else if (ea !== eb) {
      return ea - eb
    }

    return Date.parse(a.created_at) - Date.parse(b.created_at)
  })
}
