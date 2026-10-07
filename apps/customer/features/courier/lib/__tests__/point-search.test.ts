import { describe, expect, it } from 'vitest'
import type { CourierPoint } from '../../types'
import { searchPoints } from '../point-search'

const landmarks = [
  { id: 'l1', name: 'BÓTICA Santa Rosa', category: 'salud' as const, lat: -9.1, lng: -78.2 },
  { id: 'l2', name: 'Colegio San Jacinto', category: 'educacion' as const, lat: -9.2, lng: -78.3 },
  { id: 'l3', name: 'Ojo', category: 'otro' as const, lat: -9.3, lng: -78.4 },
]

const recent: CourierPoint = {
  contactName: 'María',
  contactPhone: '912345678',
  coordinates: { lat: -9.15, lng: -78.25 },
  accuracyM: null,
  referenceText: 'Casa celeste, frente a la botica',
  label: 'María',
}

const home = {
  referenceText: 'Puerta verde, al lado del grifo',
  coordinates: { lat: -9.12, lng: -78.22 },
}

const me = { name: 'Cliente', phone: '987654321' }

describe('searchPoints', () => {
  it('sin escribir nada: «Mi dirección» (solo en la entrega) y los recientes, sin lugares', () => {
    const forDestination = searchPoints({
      query: '',
      which: 'destination',
      landmarks,
      recents: [recent],
      home,
    })
    expect(forDestination.map((o) => o.kind)).toEqual(['home', 'recent'])

    const forOrigin = searchPoints({
      query: '',
      which: 'origin',
      landmarks,
      recents: [recent],
      home,
    })
    expect(forOrigin.map((o) => o.kind)).toEqual(['recent'])
  })

  it('al escribir busca sin tildes ni mayúsculas, en recientes y lugares', () => {
    const out = searchPoints({
      query: 'botica',
      which: 'origin',
      landmarks,
      recents: [recent],
      home,
    })
    expect(out.map((o) => o.title)).toEqual(['María', 'BÓTICA Santa Rosa'])
  })

  it('cada sugerencia REEMPLAZA el contacto: reciente el suyo, un lugar ninguno', () => {
    const out = searchPoints({ query: 'a', which: 'origin', landmarks, recents: [recent], home })
    const r = out.find((o) => o.kind === 'recent')
    const l = out.find((o) => o.title === 'Colegio San Jacinto')
    expect(r?.point.contactPhone).toBe('912345678')
    // Vacío explícito, no ausente: elegir el colegio después de «María» no
    // puede dejar el celular de María en el colegio.
    expect(l?.point).toEqual({
      coordinates: { lat: -9.2, lng: -78.3 },
      referenceText: 'Colegio San Jacinto',
      label: 'Colegio San Jacinto',
      contactName: '',
      contactPhone: '',
    })
  })

  it('«Mi dirección» trae a quien pide como contacto', () => {
    const [o] = searchPoints({ query: '', which: 'destination', landmarks, recents: [], home, me })
    expect(o?.point.contactName).toBe('Cliente')
    expect(o?.point.contactPhone).toBe('987654321')
  })

  it('un lugar de nombre corto completa la referencia', () => {
    const [o] = searchPoints({ query: 'ojo', which: 'origin', landmarks, recents: [], home: null })
    expect(o?.point.referenceText).toBe('Frente a Ojo')
  })

  it('«Mi dirección» también sale si se escribe «casa» o «mi»', () => {
    const out = searchPoints({ query: 'casa', which: 'destination', landmarks, recents: [], home })
    expect(out[0]?.kind).toBe('home')
  })

  it('sin dirección guardada no hay «Mi dirección»', () => {
    const out = searchPoints({
      query: '',
      which: 'destination',
      landmarks,
      recents: [],
      home: null,
    })
    expect(out).toEqual([])
  })
})

describe('searchPoints · claves', () => {
  it('dos recientes en el mismo punto (vecinos con otro celular) tienen claves distintas', () => {
    const vecino = { ...recent, contactName: 'Pedro', contactPhone: '955555555', label: 'Pedro' }
    const out = searchPoints({
      query: '',
      which: 'origin',
      landmarks,
      recents: [recent, vecino],
      home,
    })
    expect(new Set(out.map((o) => o.key)).size).toBe(out.length)
  })
})

describe('searchPoints · negocios y tipos', () => {
  const pueblo = [
    { id: 'p1', name: 'Plaza Mayor', category: 'recreacion' as const, lat: -9.1, lng: -78.2 },
    { id: 'p2', name: 'Inkafarma', category: 'salud' as const, lat: -9.11, lng: -78.21 },
    { id: 'p3', name: 'Pollería Nadia', category: 'restaurante' as const, lat: -9.12, lng: -78.22 },
    {
      id: 'p4',
      name: 'Parque Magisterial',
      category: 'recreacion' as const,
      lat: -9.13,
      lng: -78.23,
    },
  ]
  const buscar = (query: string) =>
    searchPoints({ query, which: 'origin', landmarks: pueblo, recents: [], home: null })

  it('«botica» trae las boticas aunque el nombre no lo diga', () => {
    expect(buscar('botica').map((o) => o.title)).toEqual(['Inkafarma'])
  })

  it('«pollo» trae la pollería', () => {
    expect(buscar('pollo').map((o) => o.title)).toEqual(['Pollería Nadia'])
  })

  it('un nombre completo con palabra de tipo trae ESE lugar primero, no todos los del tipo', () => {
    const conFlorencia = [
      ...pueblo,
      {
        id: 'p5',
        name: 'Restaurant La Florencia',
        category: 'restaurante' as const,
        lat: -9.14,
        lng: -78.24,
      },
    ]
    const out = searchPoints({
      query: 'Restaurant La Florencia',
      which: 'origin',
      landmarks: conFlorencia,
      recents: [],
      home: null,
    })
    expect(out.map((o) => o.title)).toEqual(['Restaurant La Florencia'])
  })

  it('una coincidencia por nombre sale antes que una solo por tipo', () => {
    const conBotica = [
      ...pueblo,
      { id: 'p6', name: 'Botica la Merced', category: 'salud' as const, lat: -9.15, lng: -78.25 },
    ]
    const out = searchPoints({
      query: 'botica',
      which: 'origin',
      landmarks: conBotica,
      recents: [],
      home: null,
    })
    expect(out.map((o) => o.title)).toEqual(['Botica la Merced', 'Inkafarma'])
  })

  it('un negocio es «business» y sale antes que una referencia del pueblo', () => {
    const out = buscar('a') // coincide en los cuatro nombres
    expect(out.map((o) => o.kind)).toEqual(['business', 'business', 'place', 'place'])
  })
})
