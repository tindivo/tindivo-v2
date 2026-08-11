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

describe('el reloj', () => {
  it('en cocina cuenta en mm:ss', () => {
    expect(vm().clock).toEqual({ text: '04:00', tone: 'neutral', ready: false })
  })

  it('mm:ss tambien por encima de los dos minutos', () => {
    // Antes salia "~12 min" y la cajera veia "11:55" del mismo pedido.
    const v = vm({ order: order({ estimated_ready_at: new Date(NOW + min(12)).toISOString() }) })
    expect(v.clock?.text).toBe('12:00')
  })

  // ESTA ES LA REGLA QUE §23 PROTEGE, y la que una version anterior rompio al
  // fundir reloj y estado en un solo elemento.
  it('marcar la comida lista NO esconde el contador', () => {
    const v = vm({ order: order({ status: 'waiting_driver', ready_early_used: true }) })
    expect(v.clock?.text).toBe('04:00')
    expect(v.badge?.text).toBe('Lista')
  })

  // DOS ESTADOS Y NO TRES. El escalon ambar intermedio se quito: el numero ya
  // lleva el grado (`00:45` vs `14:20`), y el ambar codificaba un umbral
  // —queueLeadMinutes— que el motorizado no conoce y por tanto no puede
  // interpretar.
  it('rojo en cuanto se pasa, sin escalon intermedio', () => {
    const apenas = vm({
      order: order({
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(3)).toISOString(),
      }),
    })
    const mucho = vm({
      order: order({
        ready_early_used: true,
        estimated_ready_at: new Date(NOW - min(14)).toISOString(),
      }),
    })
    expect(apenas.clock).toEqual({ text: '03:00', tone: 'danger', ready: false })
    expect(mucho.clock).toEqual({ text: '14:00', tone: 'danger', ready: false })
  })

  it('negro mientras quede tiempo, con la comida marcada o sin marcar', () => {
    expect(vm().clock?.tone).toBe('neutral')
    expect(vm({ order: order({ ready_early_used: true }) }).clock?.tone).toBe('neutral')
  })

  it('cocina demorada, sin marcar lista: tambien rojo', () => {
    const v = vm({
      order: order({
        ready_early_used: false,
        estimated_ready_at: new Date(NOW - min(3)).toISOString(),
      }),
    })
    expect(v.clock).toEqual({ text: '03:00', tone: 'danger', ready: false })
  })

  // `urgent_since` NO PINTA NADA EN EL TABLERO.
  //
  // Lo sella el cron OrderOverdue (0134) a los 5 min sin dueno — otro reloj,
  // que salta con la comida todavia en el horno. Ese hecho ya lo avisa un push
  // vibrante con requireInteraction; anadirle banner, reordenacion y bloqueo
  // eran tres canales mas para lo mismo, gritando cuando no pasa nada.
  it('5 minutos sin tomar, con la cocina a tiempo, NO altera la tarjeta', () => {
    const v = vm({ order: order({ urgent_since: new Date(NOW - min(6)).toISOString() }) })
    expect(v.clock).toEqual({ text: '04:00', tone: 'neutral', ready: false })
    expect(v.tone).toBe('neutral')
  })

  it('con la comida encima no hay reloj de cocina', () => {
    const v = vm({ variant: 'mine', order: order({ status: 'picked_up' }) })
    expect(v.clock).toBeNull()
    expect(v.badge?.text).toBe('En reparto')
  })

  it('en Equipo hay insignia de estado pero NO reloj: no viaja', () => {
    const v = vm({
      variant: 'team',
      ownerName: 'Juan',
      order: order({ status: 'picked_up', estimated_ready_at: null }),
    })
    expect(v.clock).toBeNull()
    expect(v.badge).toEqual({ icon: 'delivery_dining', text: 'En reparto', tone: 'carrying' })
  })

  it('en el historial la hora va en la esquina y la insignia la rotula', () => {
    // Antes salia un "20:45" desnudo abajo a la izquierda, sin decir de que
    // hora hablaba. El formato lo decide `hourOf` (locale es-PE), asi que se
    // compara contra el helper y no contra un literal.
    const at = '2026-08-11T20:45:00.000Z'
    const v = vm({ variant: 'delivered', order: order({ status: 'delivered', delivered_at: at }) })
    expect(v.clock).toEqual({ text: hourOf(at), tone: 'neutral', ready: false })
    expect(v.badge).toEqual({ icon: 'check_circle', text: 'Entregado', tone: 'done' })
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

  it('lo que la bandeja marca, la tarjeta lo enseña — en el RELOJ', () => {
    // Si `orderUrgency` lo marca, la lista lo sube al tope, dispara el banner y
    // bloquea las demas, asi que la tarjeta TIENE que verse urgente. Antes tenia
    // su propio criterio y el cartel senalaba una tarjeta neutra. El canal es
    // ahora el reloj, que enrojece exactamente en el mismo instante.
    const late = order({ estimated_ready_at: new Date(NOW - min(2)).toISOString() })
    expect(orderUrgency(late, NOW)).toBe('overdue')
    expect(vm({ order: late }).clock?.tone).toBe('danger')

    // Y a la inversa: lo que la bandeja NO marca, la tarjeta no tine.
    const soon = order({ urgent_since: new Date(NOW - min(30)).toISOString() })
    expect(orderUrgency(soon, NOW)).not.toBe('overdue')
    expect(vm({ order: soon }).clock?.tone).toBe('neutral')
  })

  // EL BORDE ES EL SEGUNDO ESCALON, con umbral propio: espera a que la demora
  // cruce queueLeadMinutes. Si se encendiera a la vez que el reloj, un pedido
  // recien pasado gritaria igual que uno de veinte minutos.
  it('el borde espera al margen de cola; el reloj no', () => {
    const apenas = order({
      ready_early_used: true,
      estimated_ready_at: new Date(NOW - min(3)).toISOString(),
    })
    expect(vm({ order: apenas }).clock?.tone).toBe('danger')
    expect(vm({ order: apenas }).tone).toBe('neutral')

    const pasado = order({
      ready_early_used: true,
      estimated_ready_at: new Date(NOW - min(14)).toISOString(),
    })
    expect(vm({ order: pasado }).tone).toBe('danger')
  })

  it('el umbral del borde sale de app_settings, no del codigo', () => {
    const late = order({
      ready_early_used: true,
      estimated_ready_at: new Date(NOW - min(14)).toISOString(),
    })
    expect(vm({ order: late, queueLeadMinutes: 10 }).tone).toBe('danger')
    expect(vm({ order: late, queueLeadMinutes: 20 }).tone).toBe('neutral')
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

describe('el cobro, en dos alturas', () => {
  it('efectivo: la cifra arriba, el metodo debajo, sin verbos', () => {
    expect(vm().money).toEqual({
      headline: 'S/ 45.00',
      detail: 'efectivo',
      tone: 'neutral',
    })
  })

  it('el vuelto se deriva y se muestra tambien en En espera', () => {
    const v = vm({ order: order({ client_pays_with: 50 }) })
    expect(v.money?.detail).toBe('efectivo · vuelto S/ 5.00')
  })

  // LA PALABRA OCUPA EL SITIO DE LA CIFRA. Sin numero no hay numero que cobrar
  // por error, y el bloque se lee igual que en los otros tres casos.
  it('el prepago NO lleva cifra: la palabra ocupa su sitio', () => {
    const v = vm({ order: order({ payment_intent: 'prepaid' }) })
    expect(v.money).toEqual({ headline: 'Prepagado', detail: 'no cobrar', tone: 'success' })
  })

  it('ningun otro caso pone una palabra donde va la cifra', () => {
    for (const intent of ['pending_cash', 'pending_yape', 'pending_mixed', null]) {
      const v = vm({ order: order({ payment_intent: intent }) })
      expect(v.money?.headline, String(intent)).toMatch(/^S\/ \d/)
    }
  })

  it('el mixto desglosa, y la cifra grande es la parte en EFECTIVO', () => {
    // NO el total: en un mixto el total no es un numero que el motorizado
    // maneje, y ponerlo delante dejaba tres importes seguidos con el primero
    // redundante, porque las dos partes ya suman.
    const v = vm({
      order: order({ payment_intent: 'pending_mixed', cash_amount: 30, yape_amount: 15 }),
    })
    expect(v.money?.headline).toBe('S/ 30.00')
    expect(v.money?.detail).toBe('efectivo + S/ 15.00 Yape')
  })

  it('sin desglose el mixto no se lo inventa', () => {
    const v = vm({ order: order({ payment_intent: 'pending_mixed' }) })
    expect(v.money?.headline).toBe('S/ 45.00')
    expect(v.money?.detail).toBe('mixto')
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
    expect(v.money?.detail).toBe('efectivo + S/ 15.00 Yape · vuelto S/ 20.00')
  })

  it('un metodo nulo NO se hace pasar por efectivo', () => {
    const v = vm({ order: order({ payment_intent: null }) })
    expect(v.money?.detail).toBe('método por confirmar')
  })

  it('un metodo desconocido tampoco', () => {
    const v = vm({ order: order({ payment_intent: 'pending_wallet' }) })
    expect(v.money?.detail).toBe('método por confirmar')
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
    expect(v.money?.detail).toBe('efectivo')
  })

  it('de un pedido ajeno solo viaja el importe', () => {
    const v = vm({ variant: 'team', ownerName: 'Juan', order: order({ payment_intent: null }) })
    expect(v.money).toEqual({
      headline: 'S/ 45.00',
      detail: 'importe del pedido',
      tone: 'neutral',
    })
  })

  it('bloqueado: el motivo ocupa el sitio del precio', () => {
    const v = vm({ blocked: true, blockedReason: 'Mochila llena 3/3' })
    expect(v.money).toBeNull()
    expect(v.blockedReason).toBe('Mochila llena 3/3')
    expect(v.interactive).toBe(false)
    expect(v.muted).toBe(true)
  })
})

describe('la insignia es el ESTADO DEL PEDIDO', () => {
  // En espera: el propio status distingue si la comida esta o no, porque
  // `ready` sin motorizado deja el pedido en `waiting_driver` (0128:156-159).
  it('en espera distingue cocina de lista, por status', () => {
    expect(vm({ order: order({ status: 'preparing' }) }).badge).toEqual({
      icon: 'restaurant',
      text: 'En cocina',
      tone: 'idle',
    })
    expect(vm({ order: order({ status: 'waiting_driver' }) }).badge).toEqual({
      icon: 'check_circle',
      text: 'Lista',
      tone: 'ready',
    })
  })

  it('en Mios habla del viaje del motorizado', () => {
    const de = (status: string) => vm({ variant: 'mine', order: order({ status }) }).badge?.text
    expect(de('heading_to_restaurant')).toBe('Voy al local')
    expect(de('waiting_at_restaurant')).toBe('En el local')
    expect(de('picked_up')).toBe('En reparto')
  })

  it('en Equipo habla en tercera persona: el nombre es el del companero', () => {
    const v = vm({
      variant: 'team',
      ownerName: 'Juan',
      order: order({ status: 'heading_to_restaurant', estimated_ready_at: null }),
    })
    expect(v.badge?.text).toBe('Va al local')
  })

  // ESTE ES EL CASO QUE NO ES OBVIO. Con motorizado, `ready` NO toca el status,
  // asi que "lista" no cabe en la insignia sin pisar el estado del viaje. Viaja
  // con el reloj, que es el reloj de la comida.
  it('puede ser MIO y estar lista: los dos hechos, sin pisarse', () => {
    const v = vm({
      variant: 'mine',
      order: order({ status: 'heading_to_restaurant', ready_early_used: true }),
    })
    expect(v.badge?.text).toBe('Voy al local')
    expect(v.clock).toEqual({ text: '04:00', tone: 'neutral', ready: true })
  })

  it('en espera NO se repite el visto: la insignia ya dice "Lista"', () => {
    const v = vm({ order: order({ status: 'waiting_driver', ready_early_used: true }) })
    expect(v.badge?.text).toBe('Lista')
    expect(v.clock?.ready).toBe(false)
  })

  // Soltar un pedido lo devuelve a `preparing` o a `waiting_driver` segun la
  // comida (0121:205-210), asi que al volver a la bandeja la insignia dice la
  // verdad sin ningun caso especial.
  it('un pedido soltado vuelve con el estado que le toca', () => {
    expect(vm({ order: order({ status: 'preparing' }) }).badge?.text).toBe('En cocina')
    expect(vm({ order: order({ status: 'waiting_driver' }) }).badge?.text).toBe('Lista')
  })
})

describe('la alarma solo por debajo de cero', () => {
  it('con tiempo por delante NO tine nada, este el pedido como este', () => {
    for (const status of ['preparing', 'waiting_driver']) {
      const v = vm({ order: order({ status }) })
      expect(v.clock?.tone).toBe('neutral')
      expect(v.tone).toBe('neutral')
    }
  })

  it('el estado NO mueve el borde: un estado es un hecho, no una alarma', () => {
    // "Lista" es verde en la insignia y aun asi el borde sigue neutro.
    const v = vm({ order: order({ status: 'waiting_driver' }) })
    expect(v.badge?.tone).toBe('ready')
    expect(v.tone).toBe('neutral')
  })

  // EL ESTADO NUNCA HABLA EL IDIOMA DE LA ALARMA.
  //
  // En esta tarjeta el ambar y el rojo significan urgencia y son SOLO del
  // reloj. La gama del estado es categorica —nombra la fase— y es un tipo
  // aparte justamente para que nadie pueda meterle un tono de alarma sin que
  // TypeScript se queje. Este test cubre lo que el tipo no puede: que ningun
  // estado, en ninguna variante, acabe pintado como una urgencia.
  it('ningun estado usa un tono de alarma', () => {
    const alarma = ['warning', 'danger']
    const casos: Array<[string, 'available' | 'mine' | 'team' | 'delivered']> = [
      ['preparing', 'available'],
      ['waiting_driver', 'available'],
      ['heading_to_restaurant', 'mine'],
      ['waiting_at_restaurant', 'mine'],
      ['picked_up', 'mine'],
      ['heading_to_restaurant', 'team'],
      ['waiting_at_restaurant', 'team'],
      ['picked_up', 'team'],
      ['delivered', 'delivered'],
    ]
    for (const [status, variant] of casos) {
      const v = vm({
        variant,
        ownerName: 'Juan',
        order: order({ status, delivered_at: new Date(NOW).toISOString() }),
      })
      expect(alarma, `${variant}/${status}`).not.toContain(v.badge?.tone)
    }
  })

  it('pasado cero se enciende el reloj; el borde solo si la demora es seria', () => {
    const recien = vm({
      order: order({
        status: 'waiting_driver',
        estimated_ready_at: new Date(NOW - min(1)).toISOString(),
      }),
    })
    expect(recien.clock?.tone).toBe('danger')
    expect(recien.tone).toBe('neutral')

    const seria = vm({
      order: order({
        status: 'waiting_driver',
        estimated_ready_at: new Date(NOW - min(15)).toISOString(),
      }),
    })
    expect(seria.tone).toBe('danger')
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
