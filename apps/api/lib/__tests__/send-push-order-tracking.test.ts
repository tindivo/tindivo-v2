import { readFileSync } from 'node:fs'
import { NativePushPayloadSchema } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { buildFcmMessage, nativePayload } from '../../../../supabase/functions/send-push/native.ts'
import {
  COURIER_STEPS,
  courierGroup,
  courierProgress,
  courierReleasedNotice,
  DELIVERY_STEPS,
  deliveryReadyNotice,
  driverAtBusinessNotice,
  driverTookNotice,
  orderGroup,
  orderProgress,
  PICKUP_STEPS,
  stateSeq,
  TRACKING_TTL_SECONDS,
} from '../../../../supabase/functions/send-push/order-tracking.ts'

const SID = 'AB2C3D4E'

describe('send-push · seguimiento del pedido en la notificación (una por pedido)', () => {
  it('las llaves de presentación: order-<sid> y courier-<sid>; TTL de 3 h', () => {
    expect(orderGroup(SID)).toBe('order-AB2C3D4E')
    expect(courierGroup(SID)).toBe('courier-AB2C3D4E')
    expect(TRACKING_TTL_SECONDS).toBe(10_800)
  })

  it('ready a domicilio sin motorizado: «Tu pedido está listo» / estamos asignando', () => {
    expect(deliveryReadyNotice(SID, 'Pollería Sabor', false)).toEqual({
      title: 'Tu pedido está listo',
      body: 'Pollería Sabor lo terminó · estamos asignando a un motorizado',
      url: '/pedido/AB2C3D4E',
      group: 'order-AB2C3D4E',
      ttlSeconds: 10_800,
      nativeOnly: true,
    })
  })

  it('ready con motorizado ya asignado (take antes de ready) no dice «estamos asignando»', () => {
    const n = deliveryReadyNotice(SID, 'el restaurante', true)
    expect(n.body).toBe('El restaurante lo terminó · el motorizado ya va por él')
    expect(n.body).not.toContain('asignando')
  })

  it('take: con nombre y sin nombre del motorizado', () => {
    expect(driverTookNotice(SID, 'Marco', 'Pollería Sabor')).toEqual({
      title: 'Marco va por tu pedido',
      body: 'Lo recoge en Pollería Sabor',
      url: '/pedido/AB2C3D4E',
      group: 'order-AB2C3D4E',
      ttlSeconds: 10_800,
      nativeOnly: true,
    })
    expect(driverTookNotice(SID, '', 'Pollería Sabor').title).toBe('Un motorizado va por tu pedido')
  })

  it('arrived (al local): con nombre y sin nombre del motorizado', () => {
    expect(driverAtBusinessNotice(SID, 'Marco', 'Pollería Sabor')).toEqual({
      title: 'Marco llegó a Pollería Sabor',
      body: 'Está recogiendo tu pedido',
      url: '/pedido/AB2C3D4E',
      group: 'order-AB2C3D4E',
      ttlSeconds: 10_800,
      nativeOnly: true,
    })
    expect(driverAtBusinessNotice(SID, '', 'Pollería Sabor').title).toBe(
      'El motorizado llegó a Pollería Sabor',
    )
  })

  it('Entregas release: «Buscamos otro motorizado», a /entregas/<sid> y con courier-<sid>', () => {
    expect(courierReleasedNotice('ZZ9Y8X7W')).toEqual({
      title: 'Buscamos otro motorizado',
      body: 'El anterior no pudo llevar tu entrega · sigue en pie',
      url: '/entregas/ZZ9Y8X7W',
      group: 'courier-ZZ9Y8X7W',
      ttlSeconds: 10_800,
      nativeOnly: true,
    })
  })

  it('cada aviso nuevo, convertido en payload y mensaje de FCM, cumple el contrato y usa su group', () => {
    const notices = [
      ['OrderStatusChanged', 'ready', deliveryReadyNotice(SID, 'Pollería Sabor', false)],
      ['OrderStatusChanged', 'take', driverTookNotice(SID, 'Marco', 'Pollería Sabor')],
      ['OrderStatusChanged', 'arrived', driverAtBusinessNotice(SID, '', 'Pollería Sabor')],
      ['CourierStepped', 'release', courierReleasedNotice(SID)],
    ] as const
    for (const [eventType, action, n] of notices) {
      const tag = `${eventType}-${action}-${SID}`
      const p = nativePayload({ ...n, tag }, eventType)
      expect(NativePushPayloadSchema.parse(p)).toEqual(p)
      const m = buildFcmMessage('token', p, n.ttlSeconds)
      expect(m.message.data.tag).toBe(tag)
      expect(m.message.data.deepLink).toBe(n.url)
      expect(m.message.android.notification.tag).toBe(n.group)
      expect(m.message.android.collapse_key).toBe(n.group)
      expect(m.message.android.ttl).toBe('10800s')
    }
  })
})

// ── Paso de la barra de progreso según el estado real ─────────────────────

const ORDER_STATUSES = [
  'validando',
  'pending_acceptance',
  'awaiting_payment',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
  'ready_for_pickup',
  'delivered',
  'cancelled',
]

describe('send-push · paso del seguimiento (step/steps/terminal)', () => {
  it('pedido a domicilio: Recibido → Preparando → Listo → En camino → Entregado (5)', () => {
    expect(DELIVERY_STEPS).toBe(5)
    const paso = (status: string) => orderProgress(status, 'delivery')
    for (const s of ['validando', 'pending_acceptance', 'awaiting_payment', 'confirmed']) {
      expect(paso(s)).toEqual({ step: 1, steps: 5, terminal: false })
    }
    expect(paso('preparing')).toEqual({ step: 2, steps: 5, terminal: false })
    for (const s of ['waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant']) {
      expect(paso(s)).toEqual({ step: 3, steps: 5, terminal: false })
    }
    expect(paso('picked_up')).toEqual({ step: 4, steps: 5, terminal: false })
    expect(paso('delivered')).toEqual({ step: 5, steps: 5, terminal: true })
    expect(paso('cancelled')).toEqual({ terminal: true })
    // Un estado del recojo no tiene sitio en el domicilio: sin barra.
    expect(paso('ready_for_pickup')).toBeNull()
  })

  it('pedido para recoger: Recibido → Preparando → Listo para recoger → Entregado (4)', () => {
    expect(PICKUP_STEPS).toBe(4)
    const paso = (status: string) => orderProgress(status, 'pickup')
    for (const s of ['validando', 'pending_acceptance', 'awaiting_payment', 'confirmed']) {
      expect(paso(s)).toEqual({ step: 1, steps: 4, terminal: false })
    }
    expect(paso('preparing')).toEqual({ step: 2, steps: 4, terminal: false })
    expect(paso('ready_for_pickup')).toEqual({ step: 3, steps: 4, terminal: false })
    expect(paso('delivered')).toEqual({ step: 4, steps: 4, terminal: true })
    expect(paso('cancelled')).toEqual({ terminal: true })
    for (const s of [
      'waiting_driver',
      'heading_to_restaurant',
      'waiting_at_restaurant',
      'picked_up',
    ]) {
      expect(paso(s)).toBeNull()
    }
  })

  it('Entregas: Buscando → Asignado → En camino → Entregado (4); soltada vuelve al paso 1', () => {
    expect(COURIER_STEPS).toBe(4)
    expect(courierProgress('requested')).toEqual({ step: 1, steps: 4, terminal: false })
    for (const s of ['accepted', 'heading_to_pickup', 'at_pickup']) {
      expect(courierProgress(s)).toEqual({ step: 2, steps: 4, terminal: false })
    }
    for (const s of ['picked_up', 'heading_to_dropoff']) {
      expect(courierProgress(s)).toEqual({ step: 3, steps: 4, terminal: false })
    }
    expect(courierProgress('delivered')).toEqual({ step: 4, steps: 4, terminal: true })
    expect(courierProgress('cancelled')).toEqual({ terminal: true })
  })

  it('un estado desconocido no tiene barra ni es final', () => {
    expect(orderProgress('algo_nuevo', 'delivery')).toBeNull()
    expect(orderProgress('', 'pickup')).toBeNull()
    expect(courierProgress('algo_nuevo')).toBeNull()
  })

  it('todo paso calculado cumple el contrato al viajar (step ≤ steps, texto)', () => {
    const progresos = [
      ...ORDER_STATUSES.flatMap((s) => [orderProgress(s, 'delivery'), orderProgress(s, 'pickup')]),
      ...['requested', 'accepted', 'picked_up', 'delivered', 'cancelled'].map((s) =>
        courierProgress(s),
      ),
    ].filter((x) => x !== null)
    for (const progress of progresos) {
      const p = nativePayload(
        {
          title: 'T',
          body: 'B',
          tag: 'X-1',
          url: '/pedido/AB2C3D4E',
          group: orderGroup(SID),
          progress,
        },
        'OrderStatusChanged',
      )
      expect(NativePushPayloadSchema.parse(p)).toEqual(p)
      const data = buildFcmMessage('tok', p, TRACKING_TTL_SECONDS, true).message.data
      if (progress.step !== undefined) {
        expect(data.step).toBe(String(progress.step))
        expect(data.steps).toBe(String(progress.steps))
      }
      expect(data.terminal).toBe(progress.terminal ? '1' : undefined)
    }
  })
})

// ── Guardarraíl sobre index.ts (no se puede ejecutar en vitest: imports jsr/npm) ──

describe('send-push · orden del seguimiento (seq) y destinatario (install)', () => {
  const T1 = '2026-11-12T19:00:00.000Z'
  const T2 = '2026-11-12T19:05:00.250+00:00'

  it('stateSeq: milisegundos del updated_at; lo que no es fecha no da versión', () => {
    expect(stateSeq(T1)).toBe(Date.parse(T1))
    expect(stateSeq(T2)).toBe(Date.parse(T1) + 300_250)
    for (const malo of [undefined, null, 5, '', 'ayer', {}, '5', '1 Jan 2030', '0000-01-01T00:00:00Z']) {
      expect(stateSeq(malo), String(malo)).toBeUndefined()
    }
  })

  it('el estado posterior tiene seq mayor; una entrega soltada (vuelve al paso 1) la tiene mayor aunque el paso baje', () => {
    const aceptada = courierProgress('accepted', T1)
    const soltada = courierProgress('requested', T2)
    expect(aceptada?.step).toBe(2)
    expect(soltada?.step).toBe(1)
    expect(soltada?.seq).toBeGreaterThan(aceptada?.seq ?? 0)
    expect(orderProgress('delivered', 'delivery', T2)).toMatchObject({
      terminal: true,
      seq: stateSeq(T2),
    })
    expect(orderProgress('cancelled', 'delivery', T2)).toEqual({
      terminal: true,
      seq: stateSeq(T2),
    })
  })

  it('un updated_at dado pero ilegible no manda aviso de seguimiento: la app lo descartaria sin version (CAX-003)', () => {
    for (const malo of [null, '', 'ayer', '5', 42]) {
      expect(orderProgress('preparing', 'delivery', malo), String(malo)).toBeNull()
      expect(courierProgress('accepted', malo), String(malo)).toBeNull()
    }
  })

  it('sin updated_at el paso viaja igual, sin seq', () => {
    expect(orderProgress('preparing', 'delivery')).toEqual({ step: 2, steps: 5, terminal: false })
  })

  it('nativePayload lleva seq e install, cumple el contrato y buildFcmMessage los pone en data (también solo-datos)', () => {
    const INSTALL = '8b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    const progress = orderProgress('preparing', 'delivery', T1)
    const p = nativePayload(
      {
        title: 'T',
        body: 'B',
        tag: 'X-AB2C3D4E',
        url: '/pedido/AB2C3D4E',
        group: orderGroup(SID),
        progress,
      },
      'OrderStatusChanged',
      INSTALL,
    )
    expect(NativePushPayloadSchema.parse(p)).toEqual(p)
    expect(p.install).toBe(INSTALL)
    expect(p.seq).toBe(String(Date.parse(T1)))
    expect(p.tag).toBe('X-AB2C3D4E')
    for (const dataOnly of [true, false]) {
      const data = buildFcmMessage('tok', p, TRACKING_TTL_SECONDS, dataOnly).message.data
      expect(data.install).toBe(INSTALL)
      expect(data.seq).toBe(p.seq)
    }
  })

  it('sin installId o sin seq esos campos no viajan', () => {
    const p = nativePayload(
      {
        title: 'T',
        body: 'B',
        tag: 'X-1',
        url: '/',
        progress: { step: 1, steps: 5, terminal: false },
      },
      'E',
    )
    expect(p).not.toHaveProperty('install')
    expect(p).not.toHaveProperty('seq')
  })

  it('un seq que no es entero positivo seguro no viaja', () => {
    for (const seq of [0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      const p = nativePayload(
        {
          title: 'T',
          body: 'B',
          tag: 'X-1',
          url: '/',
          progress: { step: 1, steps: 5, terminal: false, seq },
        },
        'E',
      )
      expect(p, String(seq)).not.toHaveProperty('seq')
    }
  })
})

describe('send-push index.ts · los momentos nuevos del cliente', () => {
  const src = readFileSync(
    new URL('../../../../supabase/functions/send-push/index.ts', import.meta.url),
    'utf8',
  )
  /** El cuerpo de la rama `else if (action === '<a>')` del ciclo del pedido, hasta la siguiente. */
  const branch = (marker: string) => {
    const i = src.indexOf(marker)
    expect(i).toBeGreaterThan(0)
    const rest = src.slice(i + marker.length)
    return rest.slice(0, rest.indexOf('} else if ('))
  }

  it('ready a domicilio, take y arrived avisan al cliente con su momento', () => {
    expect(branch("} else if (action === 'ready') {")).toContain(
      'track(deliveryReadyNotice(sid, bizName, Boolean(o.driver_id)))',
    )
    expect(branch("} else if (action === 'take') {")).toContain(
      'track(driverTookNotice(sid, await driverFirstName(o.driver_id), bizName))',
    )
    expect(branch("} else if (action === 'arrived') {")).toContain(
      'track(driverAtBusinessNotice(sid, await driverFirstName(o.driver_id), bizName))',
    )
    // El recojo listo sigue con su propio aviso (no el de domicilio).
    expect(
      branch("} else if (action === 'ready' && o.delivery_method === 'pickup') {"),
    ).not.toContain('deliveryReadyNotice')
  })

  it('`track` va solo al cliente, a la app nativa y con el tag del evento', () => {
    const i = src.indexOf('const track = (notice: TrackingNotice) => {')
    expect(i).toBeGreaterThan(0)
    const body = src.slice(i, src.indexOf('\n    }\n', i))
    expect(body).toContain('if (!cust) return')
    expect(body).toContain('userId: cust,')
    expect(body).toContain("app: 'customer',")
    expect(body).toContain('tag: tagOf(sid),')
    expect(body).toContain('...notice,')
  })

  it('Entregas release avisa al cliente bajo la guarda de «sigue en la bolsa»', () => {
    const i = src.indexOf("if (c.status !== 'requested' || c.driver_id) return []")
    const j = src.indexOf("if (action === 'release' && customer) {")
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
    const bloque = src.slice(j, src.indexOf('\n    }\n', j))
    expect(bloque).toContain('userId: customer,')
    expect(bloque).toContain("app: 'customer',")
    expect(bloque).toContain('...courierReleasedNotice(sid),')
  })

  it('un aviso nativeOnly no sale por Web Push: ni se leen sus suscripciones', () => {
    const i = src.indexOf('const subs = note.nativeOnly')
    const iQuery = src.indexOf(".from('push_subscriptions')", i)
    const iWeb = src.indexOf('webpush.sendNotification(')
    expect(i).toBeGreaterThan(0)
    expect(iQuery).toBeGreaterThan(i)
    expect(src.slice(i, iQuery)).toContain('? []')
    expect(iWeb).toBeGreaterThan(iQuery)
  })

  it('el paso sale del estado REAL leído de la base y solo va en avisos al cliente', () => {
    // Ciclo del pedido: se lee `status` y el paso se calcula una vez para toda la rama.
    expect(src).toContain(
      "const progress = orderProgress(\n      String(o.status ?? ''),\n      String(o.delivery_method ?? ''),\n      o.updated_at,\n    )",
    )
    expect(src).toContain(
      "'short_id,business_id,customer_user_id,driver_id,status,updated_at,cancel_reason,payment_intent,order_amount,delivery_fee,prep_time_minutes,delivery_method,pickup_timing'",
    )
    expect(src).toContain("...(app === 'customer' ? custProgress : {}),")
    // Comprobante/validado: también leen `status` y `delivery_method`.
    expect(src).toContain(
      ".select('short_id,business_id,customer_user_id,prep_time_minutes,status,updated_at,delivery_method')",
    )
    // Entregas: del `courier_orders.status`, en `toCustomer` y en el aviso de soltada.
    expect(src).toContain(
      "const progressOf = courierProgress(String(c.status ?? ''), c.updated_at)",
    )
    expect(src.match(/\.\.\.custProgress,/g)?.length).toBe(3)
  })

  it('cada dispositivo se lee con su install_id y viaja a deliverToDevices', () => {
    expect(src).toContain(".select('id,platform,token,environment,install_id')")
    expect(src).toContain('installId: d.install_id as string,')
  })

  it('los avisos de pedido y de Entregas llevan su group (una notificación por pedido)', () => {
    // El helper del ciclo del pedido, los avisos previos, el de pedido nuevo, comprobante/validado,
    // cola, liberado y atrasado: 7 sitios con `...orderTracking(`.
    expect(src.match(/\.\.\.orderTracking\(/g)?.length).toBe(7)
    // Entregas: cliente y motorizados con `...tracking`, la rendición con su group.
    expect(src).toContain(
      'const tracking = { group: courierGroup(sid), ttlSeconds: TRACKING_TTL_SECONDS }',
    )
    expect(src.match(/\.\.\.tracking,/g)?.length).toBe(2)
    expect(src).toContain('group: tracking.group,')
  })
})
