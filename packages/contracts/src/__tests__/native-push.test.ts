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

  it('install es opcional (aditivo en v1) y va de 8 a 64 caracteres', () => {
    const install = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b'
    expect(NativePushPayloadSchema.parse({ ...valido, install })).toEqual({ ...valido, install })
    expect(NativePushPayloadSchema.safeParse(valido).success).toBe(true)
    for (const malo of ['', 'corto', 'x'.repeat(65)]) {
      expect(NativePushPayloadSchema.safeParse({ ...valido, install: malo }).success).toBe(false)
    }
  })
})
