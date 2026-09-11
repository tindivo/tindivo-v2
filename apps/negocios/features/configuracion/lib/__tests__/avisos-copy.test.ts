import { describe, expect, it } from 'vitest'
import type { PushStatus } from '@/hooks/use-push-status'
import { avisosEncendidos, avisosVista } from '../avisos-copy'

const TODOS: PushStatus[] = ['unsupported', 'default', 'denied', 'granted', 'off', 'subscribed']

describe('avisosVista · qué se deja tocar y qué no', () => {
  it('BLOQUEADO NO SE PUEDE TOCAR: el navegador ya no vuelve a preguntar', () => {
    // Un interruptor vivo ahí no hace nada. La persona lo mueve, lo ve volver a
    // su sitio, y se queda creyendo que es cosa del panel mientras sigue sin
    // recibir avisos.
    expect(avisosVista('denied').editable).toBe(false)
  })

  it('sin soporte tampoco: no hay nada que activar', () => {
    expect(avisosVista('unsupported').editable).toBe(false)
  })

  it('los tres estados reparables desde aquí sí se tocan', () => {
    // `default` nunca preguntó, `off` lo apagó alguien y `granted` es el bug.
    for (const s of ['default', 'off', 'granted'] as PushStatus[]) {
      expect(avisosVista(s).editable, s).toBe(true)
    }
  })
})

describe('avisosEncendidos · solo una suscripción viva cuenta', () => {
  it('SOLO `subscribed` enciende el interruptor', () => {
    // Ni el permiso concedido ni la intención de la cajera hacen que llegue un
    // aviso: lo único que lo hace es una suscripción registrada en el backend.
    for (const s of TODOS) {
      expect(avisosEncendidos(s), s).toBe(s === 'subscribed')
    }
  })

  it('`granted` no cuenta como encendido, que es justo el bug que se escondía', () => {
    expect(avisosEncendidos('granted')).toBe(false)
  })
})

describe('avisosVista · qué se explica con un cartel', () => {
  it('el estado sano es el ÚNICO sin cartel: el interruptor ya lo dice', () => {
    // Repetirlo en verde enseñaba a no leer los carteles, que es la costumbre
    // que no queremos la noche en que uno diga algo.
    for (const s of TODOS) {
      expect(avisosVista(s).alerta === null, s).toBe(s === 'subscribed')
    }
  })

  it('APAGADO A MANO SIGUE AVISANDO: es una decisión, pero cuesta pedidos', () => {
    expect(avisosVista('off').alerta?.detalle).toMatch(/cancelarse solo/i)
  })

  it('el bloqueado explica el camino a los ajustes, que es su única salida', () => {
    expect(avisosVista('denied').alerta?.detalle).toMatch(/ajustes del navegador/i)
  })

  it('EL CASO DEL BUG se cuenta entero: permiso dado y token sin registrar', () => {
    const alerta = avisosVista('granted').alerta
    expect(alerta?.titulo).toMatch(/no está registrado/i)
    // Y dice qué hacer si el auto-arreglo no lo resuelve.
    expect(alerta?.detalle).toMatch(/apaga el interruptor/i)
  })

  it('todos los estados dicen algo bajo el interruptor', () => {
    for (const s of TODOS) {
      expect(avisosVista(s).resumen.length, s).toBeGreaterThan(0)
    }
  })

  it('todo cartel trae icono, título y detalle', () => {
    for (const s of TODOS) {
      const alerta = avisosVista(s).alerta
      if (!alerta) continue
      expect(alerta.icon.length, s).toBeGreaterThan(0)
      expect(alerta.titulo.length, s).toBeGreaterThan(0)
      expect(alerta.detalle.length, s).toBeGreaterThan(0)
    }
  })

  it('ningún cartel se pinta en verde: un cartel existe porque algo va mal', () => {
    for (const s of TODOS) {
      expect(avisosVista(s).alerta?.tono.includes('success') ?? false, s).toBe(false)
    }
  })
})
