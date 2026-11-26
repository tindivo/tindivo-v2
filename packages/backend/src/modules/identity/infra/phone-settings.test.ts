import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it, vi } from 'vitest'
import {
  loadPhoneSettings,
  PHONE_CODE_MAX_PER_24H_DEFAULT,
  parsePhoneCodeMax,
  parsePhoneTransferEnabled,
} from './phone-settings'

function dbWith(result: { data: unknown; error: unknown }): TypedSupabaseClient {
  const query = { in: vi.fn().mockResolvedValue(result) }
  return { from: vi.fn(() => ({ select: vi.fn(() => query) })) } as unknown as TypedSupabaseClient
}

describe('CA-AUT-12 · el tope de envíos de código sale de app_settings', () => {
  it('sin fila o con un valor roto, rige el tope de siempre', () => {
    expect(PHONE_CODE_MAX_PER_24H_DEFAULT).toBe(3)
    for (const raw of [undefined, null, 'x', 0, -1, 2.5, Number.NaN, true]) {
      expect(parsePhoneCodeMax(raw)).toBe(PHONE_CODE_MAX_PER_24H_DEFAULT)
    }
  })

  it('un valor sobre el techo se acota a 20 y se registra', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsePhoneCodeMax(21)).toBe(20)
    expect(parsePhoneCodeMax(1000)).toBe(20)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('un entero positivo razonable cambia el tope sin tocar el código', () => {
    expect(parsePhoneCodeMax(1)).toBe(1)
    expect(parsePhoneCodeMax(5)).toBe(5)
  })

  it('lee las dos claves en una sola consulta', async () => {
    const settings = await loadPhoneSettings(
      dbWith({
        data: [
          { key: 'phone_code_max_per_24h', value: 5 },
          { key: 'phone_transfer_enabled', value: true },
        ],
        error: null,
      }),
    )
    expect(settings).toEqual({ maxCodesPer24h: 5, transferEnabled: true })
  })

  it('si la lectura falla, cae al tope de siempre y no ofrece el traslado', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const settings = await loadPhoneSettings(dbWith({ data: null, error: { message: 'caído' } }))
    expect(settings).toEqual({ maxCodesPer24h: 3, transferEnabled: false })
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })
})

describe('CA-AUT-09 · el traslado de celular está apagado salvo orden expresa', () => {
  it('solo el booleano true lo enciende', () => {
    expect(parsePhoneTransferEnabled(true)).toBe(true)
    for (const raw of [undefined, null, false, 'true', 1, {}]) {
      expect(parsePhoneTransferEnabled(raw)).toBe(false)
    }
  })
})
