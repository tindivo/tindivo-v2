import { describe, expect, it } from 'vitest'
import { hourOf } from '../../format'
import type { CardOrder } from '../../types'
import { buildCardVM, type CardVMInput } from '../card-view-model'

const NOW = Date.parse('2026-08-11T20:00:00.000Z')
const min = (n: number) => n * 60_000

function order(overrides: Partial<CardOrder> = {}): CardOrder {
  return {
    id: 'ord_1',
    short_id: 'A3K2M9XY',
    status: 'waiting_driver',
    source: 'business_manual',
    customer_name: 'María Quispe',
    delivery_address: null,
    delivery_reference: 'Frente a la bodega de doña Rosa',
    order_amount: 40,
    delivery_fee: 5,
    payment_intent: 'pending_cash',
    change_to_give: null,
    client_pays_with: null,
    cash_amount: null,
    yape_amount: null,
    occupancy_slots: 1,
    estimated_ready_at: new Date(NOW + min(4)).toISOString(),
    ready_early_used: false,
    urgent_since: null,
    delivered_at: null,
    business: {
      id: 'biz_1',
      name: 'La Florencia',
      phone: null,
      address: null,
      accent_color: 'f97316',
      coordinates_lat: null,
      coordinates_lng: null,
    },
    ...overrides,
  }
}

function vm(input: Partial<CardVMInput> = {}) {
  return buildCardVM({
    order: order(),
    now: NOW,
    variant: 'available',
    queueLeadMinutes: 10,
    ...input,
  })
}

describe('identidad', () => {
  it('el nombre del cliente manda, y el codigo baja a la cejilla', () => {
    const v = vm()
    expect(v.identity).toBe('María Quispe')
    expect(v.shortId).toBe('A3K2M9XY')
  })

  it('sin nombre el codigo SUBE a identidad y desaparece de la cejilla', () => {
    // El canal manual declara el nombre opcional (0032) y es el 100% del piloto.
    const v = vm({ order: order({ customer_name: null }) })
    expect(v.identity).toBe('#A3K2M9XY')
    expect(v.shortId).toBeNull()
  })

  it('un nombre en blanco cuenta como ausente', () => {
    const v = vm({ order: order({ customer_name: '   ' }) })
    expect(v.identity).toBe('#A3K2M9XY')
  })

  it('en Equipo la identidad es el companero, con icono que lo desambigua', () => {
    const v = vm({ variant: 'team', ownerName: 'Juan Ríos' })
    expect(v.identity).toBe('Juan Ríos')
    expect(v.identityIcon).toBe('directions_bike')
  })
})

describe('ranura', () => {
  it('en cocina cuenta en mm:ss', () => {
    expect(vm().slot).toEqual({ icon: 'schedule', text: '04:00', tone: 'neutral' })
  })

  it('mm:ss tambien por encima de los dos minutos', () => {
    // Antes salia "~12 min" y la cajera veia "11:55" del mismo pedido.
    const v = vm({ order: order({ estimated_ready_at: new Date(NOW + min(12)).toISOString() }) })
    expect(v.slot?.text).toBe('12:00')
  })

  it('comida lista con reloj vivo dice Lista, no el contador', () => {
    const v = vm({ order: order({ ready_early_used: true }) })
    expect(v.slot).toEqual({ icon: 'check_circle', text: 'Lista', tone: 'success' })
  })

  it('lista y sin recoger dentro del margen: ambar y copy de reparto', () => {
    const v = vm({
      order: order({
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(3)).toISOString(),
      }),
    })
    expect(v.slot).toEqual({ icon: 'schedule', text: 'Te espera 03:00', tone: 'warning' })
  })

  it('pasado queueLeadMinutes escala a rojo', () => {
    const v = vm({
      order: order({
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(14)).toISOString(),
      }),
    })
    expect(v.slot?.tone).toBe('danger')
    expect(v.slot?.text).toBe('Te espera 14:00')
  })

  it('el umbral sale de app_settings, no del codigo', () => {
    const late = order({
      ready_early_used: true,
      estimated_ready_at: new Date(NOW - min(14)).toISOString(),
    })
    expect(vm({ order: late, queueLeadMinutes: 20 }).slot?.tone).toBe('warning')
  })

  it('cocina demorada habla de la cocina, no del reparto', () => {
    const v = vm({
      order: order({
        ready_early_used: false,
        estimated_ready_at: new Date(NOW - min(3)).toISOString(),
      }),
    })
    expect(v.slot).toEqual({ icon: 'priority_high', text: 'Esperando 03:00', tone: 'danger' })
  })

  it('con la comida encima no hay reloj de cocina', () => {
    const v = vm({ variant: 'mine', order: order({ status: 'picked_up' }) })
    expect(v.slot).toBeNull()
  })

  it('en Equipo la ranura lleva el estado, porque el reloj no viaja', () => {
    const v = vm({
      variant: 'team',
      ownerName: 'Juan',
      order: order({ status: 'picked_up', estimated_ready_at: null }),
    })
    expect(v.slot).toEqual({ icon: 'delivery_dining', text: 'En reparto', tone: 'neutral' })
  })

  it('en el historial la ranura lleva la hora ROTULADA', () => {
    // Antes salia un "20:45" desnudo abajo a la izquierda, sin decir de que
    // hora hablaba. El formato lo decide `hourOf` (locale es-PE), asi que se
    // compara contra el helper y no contra un literal.
    const at = '2026-08-11T20:45:00.000Z'
    const v = vm({ variant: 'delivered', order: order({ status: 'delivered', delivered_at: at }) })
    expect(v.slot?.text).toBe(`Entregado ${hourOf(at)}`)
  })
})

describe('tono del borde', () => {
  it('un entregado NUNCA se colorea, por vieja que sea su ETA', () => {
    // El historial entero salia en rojo: la ETA de hace horas disparaba la
    // alarma porque el calculo no miraba la variante.
    const v = vm({
      variant: 'delivered',
      order: order({
        status: 'delivered',
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(240)).toISOString(),
        delivered_at: new Date(NOW - min(180)).toISOString(),
      }),
    })
    expect(v.tone).toBe('neutral')
  })

  it('en espera usa el MISMO criterio de vencido que la bandeja', () => {
    // `urgent_since` marcado y ETA aun futura: la lista lo sube al tope y
    // bloquea las demas, asi que la tarjeta tiene que verse vencida.
    const v = vm({ order: order({ urgent_since: new Date(NOW - min(5)).toISOString() }) })
    expect(v.tone).toBe('danger')
  })

  it('ETA vencida sin ready_early tambien tine la tarjeta', () => {
    const v = vm({
      order: order({
        ready_early_used: false,
        estimated_ready_at: new Date(NOW - min(2)).toISOString(),
      }),
    })
    expect(v.tone).toBe('danger')
  })

  it('en Mios el criterio de vencido de la bandeja NO aplica', () => {
    // Mira si la ETA ya paso, y con el pedido recogido eso es cierto siempre.
    const v = vm({
      variant: 'mine',
      order: order({
        status: 'picked_up',
        estimated_ready_at: new Date(NOW - min(30)).toISOString(),
      }),
    })
    expect(v.tone).toBe('neutral')
  })

  it('Equipo se queda neutro', () => {
    expect(vm({ variant: 'team', ownerName: 'Juan' }).tone).toBe('neutral')
  })
})

describe('linea de cobro', () => {
  it('efectivo: cifra, metodo, sin verbos', () => {
    expect(vm().money).toEqual({
      icon: 'payments',
      amount: 'S/ 45.00',
      label: 'efectivo',
      change: null,
      tone: 'neutral',
    })
  })

  it('el vuelto se deriva y se muestra tambien en En espera', () => {
    const v = vm({ order: order({ client_pays_with: 50 }) })
    expect(v.money?.change).toBe('vuelto S/ 5.00')
  })

  it('el prepago NO lleva cifra', () => {
    const v = vm({ order: order({ payment_intent: 'prepaid' }) })
    expect(v.money?.amount).toBeNull()
    expect(v.money?.label).toBe('Prepagado · no cobrar')
    expect(v.money?.tone).toBe('success')
  })

  it('el mixto desglosa las dos partes', () => {
    const v = vm({
      order: order({ payment_intent: 'pending_mixed', cash_amount: 30, yape_amount: 15 }),
    })
    expect(v.money?.label).toBe('S/ 30.00 efectivo + S/ 15.00 Yape')
  })

  it('el mixto ahora SI calcula vuelto sobre su parte en efectivo', () => {
    // Antes se pasaba `cashAmount: null` a pelo, asi que el vuelto de un mixto
    // no se mostraba jamas.
    const v = vm({
      order: order({
        payment_intent: 'pending_mixed',
        cash_amount: 30,
        yape_amount: 15,
        client_pays_with: 50,
      }),
    })
    expect(v.money?.change).toBe('vuelto S/ 20.00')
  })

  it('un metodo nulo NO se hace pasar por efectivo', () => {
    const v = vm({ order: order({ payment_intent: null }) })
    expect(v.money?.label).toBe('método por confirmar')
  })

  it('un metodo desconocido tampoco', () => {
    const v = vm({ order: order({ payment_intent: 'pending_wallet' }) })
    expect(v.money?.label).toBe('método por confirmar')
  })

  it('en el historial no se habla de vuelto', () => {
    const v = vm({
      variant: 'delivered',
      order: order({
        status: 'delivered',
        client_pays_with: 50,
        delivered_at: new Date(NOW).toISOString(),
      }),
    })
    expect(v.money?.change).toBeNull()
    expect(v.money?.label).toBe('efectivo')
  })

  it('de un pedido ajeno solo viaja el importe', () => {
    const v = vm({ variant: 'team', ownerName: 'Juan', order: order({ payment_intent: null }) })
    expect(v.money?.label).toBe('importe')
    expect(v.money?.amount).toBe('S/ 45.00')
  })

  it('bloqueado: el motivo ocupa el sitio del precio', () => {
    const v = vm({ blocked: true, blockedReason: 'Mochila llena 3/3' })
    expect(v.money).toBeNull()
    expect(v.blockedReason).toBe('Mochila llena 3/3')
    expect(v.interactive).toBe(false)
    expect(v.muted).toBe(true)
  })
})

describe('verbo de accion', () => {
  it('solo lo lleva Mios', () => {
    expect(vm({ variant: 'mine', order: order({ status: 'heading_to_restaurant' }) }).action).toBe(
      'Ir al local',
    )
    expect(vm().action).toBeNull()
    expect(vm({ variant: 'team', ownerName: 'Juan' }).action).toBeNull()
    expect(vm({ variant: 'delivered' }).action).toBeNull()
  })

  it('en Mios no repite el nombre que ya esta arriba', () => {
    const v = vm({ variant: 'mine', order: order({ status: 'picked_up' }) })
    expect(v.action).toBe('Entregar pedido')
  })

  it('un preparing tomable ya no cae en un generico "Ver pedido"', () => {
    // En "En espera" no hay fila de verbo, asi que no hay mapa que fallar.
    const v = vm({ order: order({ status: 'preparing' }) })
    expect(v.action).toBeNull()
  })
})

describe('huecos de mochila', () => {
  it('Equipo avisa cuando el pedido ocupa mas de uno', () => {
    const v = vm({ variant: 'team', ownerName: 'Juan', order: order({ occupancy_slots: 2 }) })
    expect(v.slotsNote).toBe('2 huecos')
  })

  it('con un solo hueco no dice nada', () => {
    expect(vm({ variant: 'team', ownerName: 'Juan' }).slotsNote).toBeNull()
  })
})
