import { describe, expect, it } from 'vitest'
import { pruneAcks } from '../use-acknowledged'

/**
 * LA PODA QUE SE COMÍA A SÍ MISMA.
 *
 * El acuse de recibo tiene que sobrevivir a una recarga: el panel se reinicia
 * solo con un despliegue o con un tirón de red, y si al volver la alarma
 * empieza de cero por pedidos que la cajera ya había visto, el arreglo entero
 * (que la alarma deje de ser insoportable) no sirve de nada.
 *
 * La primera versión lo rompía sin que se notara en ningún test: al montar,
 * `rows` está vacío un instante —los pedidos llegan por la consulta— y la poda
 * corría igual, encontraba cero claves vivas y borraba todo lo que acababa de
 * leer de `localStorage`.
 */
describe('pruneAcks', () => {
  it('con el tablero todavía sin cargar NO borra nada', () => {
    const guardados = ['ord_a:pending_acceptance', 'ord_b:validando']
    expect(pruneAcks(guardados, new Set())).toEqual(guardados)
  })

  it('ya cargado, tira los acuses de situaciones que ya no existen', () => {
    const guardados = ['ord_a:pending_acceptance', 'ord_viejo:pending_acceptance']
    const vivas = new Set(['ord_a:pending_acceptance', 'ord_c:preparing'])
    expect(pruneAcks(guardados, vivas)).toEqual(['ord_a:pending_acceptance'])
  })

  it('el acuse muere con la SITUACIÓN, no con el pedido', () => {
    // Misma fila, otro estado: el acuse del `pending_acceptance` se va, y por eso
    // el prepago vuelve a sonar cuando entra el comprobante.
    const guardados = ['ord_a:pending_acceptance']
    const vivas = new Set(['ord_a:validando'])
    expect(pruneAcks(guardados, vivas)).toEqual([])
  })

  it('no muta la lista que recibe', () => {
    const guardados = ['ord_a:pending_acceptance']
    pruneAcks(guardados, new Set())
    pruneAcks(guardados, new Set(['otra']))
    expect(guardados).toEqual(['ord_a:pending_acceptance'])
  })
})
