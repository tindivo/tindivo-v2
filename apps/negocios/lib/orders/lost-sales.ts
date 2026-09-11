import type { OrderVM } from './view-model'

/**
 * LO QUE SE ESCAPÓ, Y POR QUÉ HACE FALTA DECIRLO EN VOZ ALTA.
 *
 * Cuando un pedido se autocancela por no atenderlo, hoy no pasa nada. La tarjeta
 * cambia a gris, baja a «cerrados» y el tablero sigue como si tal cosa. Un
 * pedido perdido y uno entregado se parecen demasiado en la pantalla.
 *
 * La noche del 8 de septiembre, Pizza Priamo perdió tres seguidos —`DTH7CQFV`
 * (20:17), `VHRTX2ML` (20:45), `X9MV4TED` (20:54), S/99— y siguió perdiendo,
 * porque nada le contó que había perdido el primero. Los tres avisos de pedido
 * nuevo se entregaron bien; el problema no fue la alerta de entrada, fue que
 * NADIE CERRÓ EL BUCLE. A las 21:07 los clientes llamaron y hubo que teclear
 * tres pedidos manuales.
 *
 * Un aviso de venta perdida es raro por definición —seis en sesenta días en todo
 * el piloto— y eso es justo lo que lo hace barato: puede permitirse ser
 * interruptivo, porque casi nunca interrumpe. Y llega tarde a propósito: no
 * salva el pedido que ya murió, salva el SIGUIENTE, que es el que estaba a punto
 * de morir igual.
 */

/**
 * LOS MOTIVOS QUE SON CULPA DEL MOSTRADOR, QUE NO SON TODOS.
 *
 * `pending_acceptance_timeout` (nadie aceptó en 5 minutos) y
 * `validation_timeout` (nadie miró la captura del pago) son pedidos que se
 * perdieron por no atenderlos: había algo que hacer y no se hizo.
 *
 * `prepay_timeout` NO entra, y la diferencia importa. Ahí el negocio aceptó y el
 * reloj lo corría el CLIENTE, que no llegó a pagar: reprochárselo a la cajera
 * sería enseñarle a ignorar el aviso, que es exactamente lo que no queremos que
 * aprenda. Un aviso que a veces miente deja de ser un aviso.
 */
export const MOTIVOS_VENTA_PERDIDA: readonly string[] = [
  'pending_acceptance_timeout',
  'validation_timeout',
]

/** ¿Este pedido se perdió por no atenderlo? */
export function esVentaPerdida(o: Pick<OrderVM, 'status' | 'cancelReasonCode'>): boolean {
  return (
    o.status === 'cancelled' &&
    o.cancelReasonCode !== null &&
    MOTIVOS_VENTA_PERDIDA.includes(o.cancelReasonCode)
  )
}

/**
 * Las ventas perdidas que todavía no se han enseñado.
 *
 * `avisadas` son los `rowId` que la cajera ya vio y cerró. Se compara por
 * `rowId` y no por estado: un pedido cancelado ya no cambia más —`cancelled` es
 * terminal para estos motivos—, así que una vez visto está visto para siempre.
 *
 * Ordenadas de la más antigua a la más reciente, que es el orden en que se
 * cuentan: «se escaparon tres» empieza por la primera.
 */
export function ventasPerdidasSinAvisar(
  vms: readonly OrderVM[],
  avisadas: ReadonlySet<string>,
): OrderVM[] {
  return vms.filter((o) => esVentaPerdida(o) && !avisadas.has(o.rowId)).reverse()
}

/** Lo que suman las ventas perdidas que se están enseñando. */
export function totalPerdido(perdidas: readonly OrderVM[]): number {
  return perdidas.reduce((suma, o) => suma + o.total, 0)
}

/**
 * El titular del aviso. Uno solo se nombra; varios se cuentan, porque a partir
 * de dos lo que importa no es cuál fue sino que está pasando otra vez.
 */
export function tituloVentaPerdida(perdidas: readonly OrderVM[]): string {
  if (perdidas.length === 1) return 'Se escapó un pedido'
  return `Se escaparon ${perdidas.length} pedidos`
}
