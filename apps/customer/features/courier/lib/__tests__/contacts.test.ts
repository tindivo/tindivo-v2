import { describe, expect, it } from 'vitest'
import { recentContacts, suggestContacts } from '../contacts'

const row = (o: Partial<Record<string, string | null>>) => ({
  origin_name: null,
  origin_phone: null,
  destination_name: null,
  destination_phone: null,
  ...o,
})

describe('recentContacts', () => {
  it('junta recojo y entrega, del más reciente al más antiguo, sin repetir el celular', () => {
    const rows = [
      row({
        destination_name: 'Doña Rosa',
        destination_phone: '987654321',
        origin_name: 'Pedro',
        origin_phone: '912345678',
      }),
      row({ origin_name: 'Rosa Quispe', origin_phone: '+51987654321' }),
    ]
    expect(recentContacts(rows, null)).toEqual([
      { name: 'Doña Rosa', phone: '987654321' },
      { name: 'Pedro', phone: '912345678' },
    ])
  })

  it('deja fuera al propio cliente, que ya tiene «Soy yo»', () => {
    const rows = [row({ destination_name: 'Cliente', destination_phone: '900000004' })]
    expect(recentContacts(rows, '51900000004')).toEqual([])
  })

  it('sin celular se distingue por nombre y las filas sin nombre se ignoran', () => {
    const rows = [
      row({ origin_name: 'Bodega Ana' }),
      row({ origin_name: 'bodega ana' }),
      row({ destination_name: '  ', destination_phone: '911111111' }),
    ]
    expect(recentContacts(rows, null)).toEqual([{ name: 'Bodega Ana', phone: '' }])
  })
})

describe('suggestContacts', () => {
  const all = [
    { name: 'Doña Rosa', phone: '987654321' },
    { name: 'Pedro Ramos', phone: '912345678' },
  ]

  it('con el campo vacío ofrece todos', () => {
    expect(suggestContacts(all, '')).toHaveLength(2)
  })

  it('filtra por lo escrito, sin distinguir mayúsculas ni tildes', () => {
    expect(suggestContacts(all, 'dona')).toEqual([{ name: 'Doña Rosa', phone: '987654321' }])
    expect(suggestContacts(all, 'RAM')).toEqual([{ name: 'Pedro Ramos', phone: '912345678' }])
  })

  it('no repite lo que ya está escrito completo', () => {
    expect(suggestContacts(all, 'Pedro Ramos')).toEqual([])
  })
})
