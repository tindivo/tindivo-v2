import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it, vi } from 'vitest'
import {
  AccountDeletedError,
  maskPhone,
  releasePhoneCode,
  reservePhoneCode,
} from './phone-code-reservation'

const ID = 'be26f55a-b8c0-4f2d-bd9a-520634669599'

function dbWith(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { db: { rpc } as unknown as TypedSupabaseClient, rpc }
}

describe('CA-AUT-14 · la reserva del envío de código es atómica y falla cerrado', () => {
  it('llama a reserve_phone_code con el usuario, el número y el tope, y devuelve el id apuntado', async () => {
    const { db, rpc } = dbWith({ data: ID, error: null })
    expect(await reservePhoneCode(db, 'u1', '+51987654321', 3)).toBe(ID)
    expect(rpc).toHaveBeenCalledWith('reserve_phone_code', {
      p_user_id: 'u1',
      p_phone: '+51987654321',
      p_max: 3,
    })
  })

  it('devuelve null cuando el tope ya se alcanzó', async () => {
    const { db } = dbWith({ data: null, error: null })
    expect(await reservePhoneCode(db, 'u1', '+51987654321', 1)).toBeNull()
  })

  it('un error de la base lanza (quien llama rechaza) y no repite el mensaje ni el número', async () => {
    const { db } = dbWith({ data: null, error: { message: 'fallo con +51987654321' } })
    const error = await reservePhoneCode(db, 'u1', '+51987654321', 3).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain('987654321')
  })

  it('una respuesta que no es un id ni null lanza', async () => {
    for (const data of [undefined, 1, true, false, '', { id: ID }]) {
      const { db } = dbWith({ data, error: null })
      await expect(reservePhoneCode(db, 'u1', '+51987654321', 3)).rejects.toThrow()
    }
  })

  it('una cuenta borrada se distingue de un fallo cualquiera', async () => {
    const { db } = dbWith({ data: null, error: { message: 'account was deleted' } })
    await expect(reservePhoneCode(db, 'u1', '+51987654321', 3)).rejects.toBeInstanceOf(
      AccountDeletedError,
    )
  })
})

describe('CA-AUT-14 · devolver el cupo falla cerrado', () => {
  it('llama a release_phone_code con el usuario y el id de la reserva', async () => {
    const { db, rpc } = dbWith({ data: true, error: null })
    await releasePhoneCode(db, 'u1', ID)
    expect(rpc).toHaveBeenCalledWith('release_phone_code', { p_user_id: 'u1', p_attempt_id: ID })
  })

  it('un error o un resultado distinto de true lanza', async () => {
    for (const result of [
      { data: null, error: { message: 'caído' } },
      { data: false, error: null },
      { data: null, error: null },
    ]) {
      const { db } = dbWith(result)
      await expect(releasePhoneCode(db, 'u1', ID)).rejects.toThrow()
    }
  })
})

describe('CA-AUT-15 · el teléfono en un log va enmascarado', () => {
  it('deja el prefijo y los tres últimos dígitos', () => {
    expect(maskPhone('+51987654321')).toBe('+51******321')
    expect(maskPhone('+51987654321')).not.toContain('9876')
  })

  it('un valor corto no revela nada', () => {
    expect(maskPhone('123')).toBe('***')
  })
})
