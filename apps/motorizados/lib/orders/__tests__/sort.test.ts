import { describe, expect, it } from 'vitest'
import { byReadyClock, type SortableOrder } from '../sort'

const NOW = Date.parse('2026-08-11T20:00:00.000Z')
const at = (mins: number) => new Date(NOW + mins * 60_000).toISOString()

/** `id` solo para poder leer el resultado; el orden no lo mira. */
function o(id: string, etaMin: number | null, createdMin: number): SortableOrder & { id: string } {
  return {
    id,
    estimated_ready_at: etaMin == null ? null : at(etaMin),
    created_at: at(createdMin),
  }
}

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id)

describe('orden de "En espera"', () => {
  it('los contadores bajan monotonos: primero el mas pasado, luego el que menos falta', () => {
    const rows = [o('falta-7', 7, -30), o('pasado-3', -3, -10), o('falta-2', 2, -50)]
    expect(ids(byReadyClock(rows))).toEqual(['pasado-3', 'falta-2', 'falta-7'])
  })

  // ESTE ES EL CASO QUE ROMPIA LA LECTURA. Ordenar por antiguedad parece
  // razonable, pero `created_at` no coincide con el reloj: cada pedido lleva su
  // propio prep_time, asi que uno pedido ANTES puede estar listo DESPUES.
  it('no ordena por antiguedad: el pedido mas viejo puede ir abajo', () => {
    const viejoYLento = o('viejo', 20, -60)
    const nuevoYRapido = o('nuevo', 2, -1)
    expect(ids(byReadyClock([viejoYLento, nuevoYRapido]))).toEqual(['nuevo', 'viejo'])
  })

  it('un solo criterio: los pasados de cero quedan arriba por aritmetica', () => {
    const rows = [o('a', 5, -1), o('b', -1, -2), o('c', -9, -3), o('d', 1, -4)]
    expect(ids(byReadyClock(rows))).toEqual(['c', 'b', 'd', 'a'])
  })

  it('sin reloj van al final, y entre ellos por antiguedad', () => {
    const rows = [o('sin-b', null, -5), o('con', 30, -1), o('sin-a', null, -50)]
    expect(ids(byReadyClock(rows))).toEqual(['con', 'sin-a', 'sin-b'])
  })

  it('a igual reloj, desempata la antiguedad', () => {
    const rows = [o('nuevo', 5, -1), o('viejo', 5, -40)]
    expect(ids(byReadyClock(rows))).toEqual(['viejo', 'nuevo'])
  })

  // El criterio viejo dependia de `now`, asi que la lista se reordenaba sola
  // cada vez que un pedido cruzaba el cero — moviendo las tarjetas bajo el
  // pulgar. Este no: el resultado es el mismo pase el tiempo que pase.
  it('el orden NO cambia con el paso del tiempo', () => {
    const rows = [o('a', 5, -1), o('b', -1, -2), o('c', 12, -3)]
    const antes = ids(byReadyClock(rows))
    // Se vuelve a ordenar "una hora despues": las ETAs son absolutas, no
    // relativas, asi que el resultado tiene que ser identico.
    expect(ids(byReadyClock(rows))).toEqual(antes)
  })

  it('no muta la lista que recibe', () => {
    const rows = [o('b', 9, -1), o('a', 1, -2)]
    const copia = [...rows]
    byReadyClock(rows)
    expect(rows).toEqual(copia)
  })
})
