import { describe, expect, it } from 'vitest'
import { NATIVE_PUSH_PAYLOAD_VERSION, NativePushPayloadSchema } from '../native-push'

const valido = {
  v: 1,
  type: 'OrderStatusChanged',
  tag: 'OrderStatusChanged-accept-AB2C3D4E',
  title: 'Pago verificado',
  body: 'Tu pedido ya está en cocina',
  deepLink: '/pedido/AB2C3D4E',
}

describe('NativePushPayloadSchema v1 (CLI-8)', () => {
  it('acepta el payload v1 y la versión es 1', () => {
    expect(NATIVE_PUSH_PAYLOAD_VERSION).toBe(1)
    expect(NativePushPayloadSchema.parse(valido)).toEqual(valido)
    expect(NativePushPayloadSchema.safeParse({ ...valido, deepLink: '/', body: '' }).success).toBe(
      true,
    )
  })

  it('group es opcional y aditivo: el v1 sin él sigue valiendo, y si viene no puede ir vacío', () => {
    const conGrupo = { ...valido, group: 'order-AB2C3D4E' }
    expect(NativePushPayloadSchema.parse(conGrupo)).toEqual(conGrupo)
    expect(NativePushPayloadSchema.safeParse(valido).success).toBe(true)
    expect(NativePushPayloadSchema.safeParse({ ...valido, group: '' }).success).toBe(false)
    expect(NativePushPayloadSchema.safeParse({ ...valido, group: 'x'.repeat(257) }).success).toBe(
      false,
    )
  })

  it('step/steps/terminal son opcionales y aditivos: sin ellos el v1 sigue valiendo', () => {
    const enCurso = { ...valido, group: 'order-AB2C3D4E', step: '2', steps: '5' }
    expect(NativePushPayloadSchema.parse(enCurso)).toEqual(enCurso)
    const entregado = { ...enCurso, step: '5', terminal: '1' }
    expect(NativePushPayloadSchema.parse(entregado)).toEqual(entregado)
    // Cancelado: final y sin barra.
    const cancelado = { ...valido, terminal: '1' }
    expect(NativePushPayloadSchema.parse(cancelado)).toEqual(cancelado)
    expect(NativePushPayloadSchema.safeParse(valido).success).toBe(true)
  })

  it('rechaza un paso inválido: 0, no numérico, step > steps o uno sin el otro', () => {
    const base = { ...valido, group: 'order-AB2C3D4E' }
    for (const extra of [
      { step: '0', steps: '5' },
      { step: '2', steps: '0' },
      { step: 'dos', steps: '5' },
      { step: '02', steps: '5' },
      { step: '-1', steps: '5' },
      { step: '1.5', steps: '5' },
      { step: '6', steps: '5' },
      { step: '10', steps: '9' },
      { step: '2' },
      { steps: '5' },
      { step: 2, steps: 5 },
      { terminal: '0' },
      { terminal: 'true' },
    ]) {
      expect(
        NativePushPayloadSchema.safeParse({ ...base, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false)
    }
  })

  it('rechaza otra versión, campos ausentes y deep links que no son una ruta de la app', () => {
    expect(NativePushPayloadSchema.safeParse({ ...valido, v: 2 }).success).toBe(false)
    for (const campo of ['type', 'tag', 'title', 'body', 'deepLink'] as const) {
      const { [campo]: _omitido, ...resto } = valido
      expect(NativePushPayloadSchema.safeParse(resto).success).toBe(false)
    }
    for (const deepLink of ['', 'pedido/1', 'https://tindivo.com/x', '//tindivo.com/x']) {
      expect(NativePushPayloadSchema.safeParse({ ...valido, deepLink }).success).toBe(false)
    }
  })
})
