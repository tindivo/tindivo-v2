import { ProblemDetailsSchema } from '@tindivo/contracts'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { describe, expect, it, vi } from 'vitest'
import { claimCustomerPhone } from '../infra/customer-phone'
import { phoneClaimProblem } from './phone-security'

describe('respuesta del reclamo del teléfono', () => {
  it('mantiene el conflicto existente y solo añade el desafío opaco', async () => {
    const proof = {
      challengeId: 'be26f55a-b8c0-4f2d-bd9a-520634669599',
      expiresAt: '2026-10-26T12:00:00Z',
    }
    const response = phoneClaimProblem({ status: 'transfer_required', ...proof }, 'request', {})
    expect(response?.status).toBe(409)
    const body = await response?.json()
    expect(ProblemDetailsSchema.parse(body)).toMatchObject({
      code: 'conflict',
      detail: 'Este número ya está asociado a otra cuenta.',
      transfer: proof,
    })
    expect(Object.keys(ProblemDetailsSchema.strict().parse(body)).sort()).toEqual([
      'code',
      'detail',
      'requestId',
      'status',
      'title',
      'transfer',
      'type',
    ])
  })

  it('un conflicto de unicidad no inventa un desafío ni revela al otro dueño', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } }),
    } as unknown as TypedSupabaseClient
    const result = await claimCustomerPhone(db, 'user', '+51923456789')
    const response = phoneClaimProblem(result, 'request', {})
    expect(response?.status).toBe(409)
    expect(await response?.json()).not.toHaveProperty('transfer')
  })

  it('falla cerrado ante una respuesta de RPC desconocida o un desafío incompleto', async () => {
    for (const data of [
      { status: 'unexpected' },
      { status: 'transfer_required', challengeId: 'invalid' },
      null,
    ]) {
      const db = {
        rpc: vi.fn().mockResolvedValue({ data, error: null }),
      } as unknown as TypedSupabaseClient
      await expect(claimCustomerPhone(db, 'user', '+51923456789')).rejects.toThrow()
    }
  })

  it('no convierte errores del proveedor en verificación ni en conflicto de negocio', async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'XX000', message: 'falló la transacción' },
      }),
    } as unknown as TypedSupabaseClient
    await expect(claimCustomerPhone(db, 'user', '+51923456789')).rejects.toThrow(
      'falló la transacción',
    )
  })

  it('conserva los detalles de espera, perfil ausente y desafío inválido', async () => {
    const cases = [
      ['wait_active', 'Ese número tiene un pedido en curso. Intenta cuando termine.'],
      ['profile_missing', 'Completa tu nombre antes de verificar tu número.'],
      ['challenge_invalid', 'El código ya no sirve. Pide uno nuevo.'],
    ] as const
    for (const [status, detail] of cases) {
      const response = phoneClaimProblem({ status }, 'request', {})
      expect(await response?.json()).toMatchObject({ code: 'conflict', status: 409, detail })
    }
  })
})
