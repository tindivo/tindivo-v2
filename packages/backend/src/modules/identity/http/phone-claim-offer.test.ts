import { ProblemDetailsSchema } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { phoneClaimProblem } from './phone-security'

const proof = {
  status: 'transfer_required' as const,
  challengeId: 'be26f55a-b8c0-4f2d-bd9a-520634669599',
  expiresAt: '2026-10-26T12:00:00Z',
}

describe('CA-AUT-09 · el número de otra cuenta se resuelve por soporte, sin traslado', () => {
  it('por defecto responde el conflicto simple, sin desafío y sin datos de la otra cuenta', async () => {
    const response = phoneClaimProblem(proof, 'request', {})
    expect(response?.status).toBe(409)
    const body = ProblemDetailsSchema.parse(await response?.json())
    expect(body.detail).toBe('Este número ya está asociado a otra cuenta.')
    expect(body).not.toHaveProperty('transfer')
  })

  it('con el traslado encendido añade el desafío opaco, como antes', async () => {
    const response = phoneClaimProblem(proof, 'request', {}, { offerTransfer: true })
    const body = ProblemDetailsSchema.parse(await response?.json())
    expect(body.transfer).toEqual({ challengeId: proof.challengeId, expiresAt: proof.expiresAt })
  })
})
