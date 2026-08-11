import { describe, expect, it } from 'vitest'
import { hourOf } from '../../format'
import type { CardOrder } from '../../types'
import { orderUrgency } from '../../urgency'
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

describe('el reloj de la esquina', () => {
  it('en cocina cuenta en mm:ss', () => {
    expect(vm().clock).toEqual({ text: '04:00', tone: 'neutral' })
  })

  it('mm:ss tambien por encima de los dos minutos', () => {
    // Antes salia "~12 min" y la cajera veia "11:55" del mismo pedido.
    const v = vm({ order: order({ estimated_ready_at: new Date(NOW + min(12)).toISOString() }) })
    expect(v.clock?.text).toBe('12:00')
  })

  // ESTA ES LA REGLA QUE §23 PROTEGE, y la que una version anterior rompio al
  // fundir reloj y estado en un solo elemento.
  it('marcar la comida lista NO esconde el contador', () => {
    const v = vm({ order: order({ ready_early_used: true }) })
    expect(v.clock).toEqual({ text: '04:00', tone: 'neutral' })
    expect(v.badge).toEqual({ icon: 'check_circle', text: 'Lista', tone: 'success' })
  })

  it('lista y sin recoger: el reloj cuenta hacia arriba, en ambar', () => {
    const v = vm({
      order: order({
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(3)).toISOString(),
      }),
    })
    expect(v.clock).toEqual({ text: '03:00', tone: 'warning' })
    expect(v.badge).toEqual({ icon: 'schedule', text: 'Te espera', tone: 'warning' })
  })

  it('pasado queueLeadMinutes escalan reloj e insignia', () => {
    const v = vm({
      order: order({
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(14)).toISOString(),
      }),
    })
    expect(v.clock).toEqual({ text: '14:00', tone: 'danger' })
    expect(v.badge?.tone).toBe('danger')
    expect(v.badge?.text).toBe('Te espera')
  })

  it('el umbral sale de app_settings, no del codigo', () => {
    const late = order({
      ready_early_used: true,
      estimated_ready_at: new Date(NOW - min(14)).toISOString(),
    })
    const v = vm({ order: late, queueLeadMinutes: 20 })
    expect(v.clock?.tone).toBe('warning')
    expect(v.badge?.tone).toBe('warning')
  })

  it('cocina demorada habla de la cocina, no del reparto', () => {
    const v = vm({
      order: order({
        ready_early_used: false,
        estimated_ready_at: new Date(NOW - min(3)).toISOString(),
      }),
    })
    expect(v.clock).toEqual({ text: '03:00', tone: 'danger' })
    expect(v.badge).toEqual({ icon: 'priority_high', text: 'Demorado', tone: 'danger' })
  })

  it('a tiempo y sin marcar, no hay insignia que poner', () => {
    expect(vm().badge).toBeNull()
  })

  // `urgent_since` NO PINTA NADA EN EL TABLERO.
  //
  // Lo sella el cron OrderOverdue (0134) a los 5 min sin dueno — otro reloj,
  // que salta con la comida todavia en el horno. Ese hecho ya lo avisa un push
  // vibrante con requireInteraction; anadirle banner, reordenacion y bloqueo
  // eran tres canales mas para lo mismo, gritando cuando no pasa nada.
  it('5 minutos sin tomar, con la cocina a tiempo, NO altera la tarjeta', () => {
    const v = vm({ order: order({ urgent_since: new Date(NOW - min(6)).toISOString() }) })
    expect(v.clock).toEqual({ text: '04:00', tone: 'neutral' })
    expect(v.badge).toBeNull()
    expect(v.tone).toBe('neutral')
  })

  it('con la comida encima no hay reloj de cocina ni insignia', () => {
    const v = vm({ variant: 'mine', order: order({ status: 'picked_up' }) })
    expect(v.clock).toBeNull()
    expect(v.badge).toBeNull()
  })

  it('en Equipo hay insignia de estado pero NO reloj: no viaja', () => {
    const v = vm({
      variant: 'team',
      ownerName: 'Juan',
      order: order({ status: 'picked_up', estimated_ready_at: null }),
    })
    expect(v.clock).toBeNull()
    expect(v.badge).toEqual({ icon: 'delivery_dining', text: 'En reparto', tone: 'neutral' })
  })

  it('en el historial la hora va en la esquina y la insignia la rotula', () => {
    // Antes salia un "20:45" desnudo abajo a la izquierda, sin decir de que
    // hora hablaba. El formato lo decide `hourOf` (locale es-PE), asi que se
    // compara contra el helper y no contra un literal.
    const at = '2026-08-11T20:45:00.000Z'
    const v = vm({ variant: 'delivered', order: order({ status: 'delivered', delivered_at: at }) })
    expect(v.clock).toEqual({ text: hourOf(at), tone: 'neutral' })
    expect(v.badge).toEqual({ icon: 'check_circle', text: 'Entregado', tone: 'neutral' })
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

  it('en espera usa el MISMO criterio que la bandeja: el reloj de la cocina', () => {
    // Si `orderUrgency` lo marca, la lista lo sube al tope, dispara el banner y
    // bloquea las demas — asi que la tarjeta TIENE que verse urgente. Antes la
    // tarjeta tenia su propio criterio y el cartel senalaba un borde neutro.
    const late = order({ estimated_ready_at: new Date(NOW - min(2)).toISOString() })
    expect(orderUrgency(late, NOW)).toBe('overdue')
    expect(vm({ order: late }).tone).toBe('danger')

    // Y a la inversa: lo que la bandeja NO marca, la tarjeta no tine.
    const soon = order({ urgent_since: new Date(NOW - min(30)).toISOString() })
    expect(orderUrgency(soon, NOW)).not.toBe('overdue')
    expect(vm({ order: soon }).tone).toBe('neutral')
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

  it('el mixto desglosa, y la cifra grande es la parte en EFECTIVO', () => {
    // NO el total: en un mixto el total no es un numero que el motorizado
    // maneje, y ponerlo delante dejaba tres importes seguidos en una linea
    // (`S/ 45.00 S/ 30.00 efectivo + S/ 15.00 Yape`) con el primero redundante.
    const v = vm({
      order: order({ payment_intent: 'pending_mixed', cash_amount: 30, yape_amount: 15 }),
    })
    expect(v.money?.amount).toBe('S/ 30.00')
    expect(v.money?.label).toBe('efectivo + S/ 15.00 Yape')
  })

  it('sin desglose el mixto no se lo inventa', () => {
    const v = vm({ order: order({ payment_intent: 'pending_mixed' }) })
    expect(v.money?.amount).toBe('S/ 45.00')
    expect(v.money?.label).toBe('mixto')
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

describe('el paso siguiente', () => {
  it('solo lo lleva Mios, y viene CON icono', () => {
    // El icono no es adorno: era la unica fila sin el, entre la referencia y el
    // cobro, asi que flotaba como un segundo titular.
    const v = vm({ variant: 'mine', order: order({ status: 'heading_to_restaurant' }) })
    expect(v.action).toEqual({ icon: 'storefront', text: 'Ir al local' })

    expect(vm().action).toBeNull()
    expect(vm({ variant: 'team', ownerName: 'Juan' }).action).toBeNull()
    expect(vm({ variant: 'delivered' }).action).toBeNull()
  })

  it('en Mios no repite el nombre que ya esta arriba', () => {
    const v = vm({ variant: 'mine', order: order({ status: 'picked_up' }) })
    expect(v.action).toEqual({ icon: 'flag', text: 'Entregar pedido' })
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
