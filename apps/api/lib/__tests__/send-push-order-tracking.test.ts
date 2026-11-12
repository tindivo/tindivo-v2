import { readFileSync } from 'node:fs'
import { NativePushPayloadSchema } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { buildFcmMessage, nativePayload } from '../../../../supabase/functions/send-push/native.ts'
import {
  courierGroup,
  courierReleasedNotice,
  deliveryReadyNotice,
  driverAtBusinessNotice,
  driverTookNotice,
  orderGroup,
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

// ── Guardarraíl sobre index.ts (no se puede ejecutar en vitest: imports jsr/npm) ──

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
