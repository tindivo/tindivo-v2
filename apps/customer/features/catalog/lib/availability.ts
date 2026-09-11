import { describeWindow, isWithinWindow } from '@tindivo/contracts'
import type { MenuItem } from '@/features/catalog/types'

/**
 * ¿PUEDE PEDIRSE ESTE PLATO AHORA, Y SI NO, QUÉ SE LE DICE AL CLIENTE?
 *
 * La Florencia sirve dos cartas: mediodía los sábados y domingos (11:00–15:00) y
 * noche el resto. Un martes a las 20:00 el ceviche no está agotado —no se ha
 * acabado nada— simplemente no es su turno, y esas dos cosas piden mensajes
 * distintos: «Agotado» deja al cliente sin saber qué hacer, mientras que «Solo
 * sáb y dom, de 11:00 a 15:00» le dice cuándo volver.
 *
 * Vive aquí y no dentro de una card porque lo necesitan las dos formas de
 * pintar un plato —la tarjeta y la fila compacta— y tienen que decir lo mismo.
 *
 * `now` se pasa para poder fijar el reloj en los tests; en la app se calcula al
 * renderizar, igual que `getOpenStatus`.
 */
export function itemWindowState(
  item: Pick<MenuItem, 'available_days' | 'available_from' | 'available_to'>,
  now: Date = new Date(),
): { outOfWindow: boolean; label: string | null } {
  const window = {
    days: item.available_days ?? null,
    from: item.available_from ?? null,
    to: item.available_to ?? null,
  }
  const label = describeWindow(window)
  // Sin franja no hay nada que decir. Y DENTRO de su franja tampoco: anunciar
  // «Solo sáb y dom» un sábado a mediodía, cuando el plato se puede pedir, es
  // ruido que solo siembra dudas sobre si se puede pedir.
  if (label === null || isWithinWindow(window, now)) return { outOfWindow: false, label: null }
  return { outOfWindow: true, label }
}
