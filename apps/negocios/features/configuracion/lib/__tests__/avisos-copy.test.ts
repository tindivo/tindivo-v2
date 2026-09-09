import { describe, expect, it } from 'vitest'
import type { PushStatus } from '@/hooks/use-push-status'
import { avisosVista } from '../avisos-copy'

const TODOS: PushStatus[] = ['unsupported', 'default', 'denied', 'granted', 'subscribed']

describe('avisosVista · qué se ofrece arreglar y qué no', () => {
  it('BLOQUEADO NO LLEVA BOTÓN: el navegador ya no vuelve a preguntar', () => {
    // Un botón ahí no hace nada. La persona lo pulsa, no pasa nada visible, y
    // se queda creyendo que lo arregló mientras sigue sin recibir avisos.
    expect(avisosVista('denied').accion).toBeNull()
  })

  it('sin soporte tampoco: no hay nada que activar', () => {
    expect(avisosVista('unsupported').accion).toBeNull()
  })

  it('ya suscrito no ofrece nada, porque no hay nada que hacer', () => {
    expect(avisosVista('subscribed').accion).toBeNull()
  })

  it('EL CASO DEL BUG sí ofrece arreglo: permiso dado y token sin registrar', () => {
    // Se veía igual que un equipo sano. Ahora se distingue y se repara de un toque.
    expect(avisosVista('granted').accion).toBe('Registrar este equipo')
  })

  it('sin preguntar todavía, ofrece activarlos', () => {
    expect(avisosVista('default').accion).toBe('Activar avisos')
  })

  it('el bloqueado explica el camino a los ajustes, que es su única salida', () => {
    expect(avisosVista('denied').detalle).toMatch(/ajustes del navegador/i)
  })

  it('todos los estados dicen algo, y solo los reparables tienen botón', () => {
    const reparables: PushStatus[] = ['default', 'granted']
    for (const s of TODOS) {
      const v = avisosVista(s)
      expect(v.titulo.length, s).toBeGreaterThan(0)
      expect(v.detalle.length, s).toBeGreaterThan(0)
      expect(v.icon.length, s).toBeGreaterThan(0)
      expect(v.accion !== null, s).toBe(reparables.includes(s))
    }
  })

  it('solo el estado sano se pinta en verde', () => {
    for (const s of TODOS) {
      expect(avisosVista(s).tono.includes('success'), s).toBe(s === 'subscribed')
    }
  })
})
