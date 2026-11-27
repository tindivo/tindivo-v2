// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrderVM } from '@/lib/orders/view-model'
import { useOrderActions } from '../use-order-actions'

const post = vi.fn<(path: string, body: unknown) => Promise<unknown>>()
vi.mock('@/lib/api', () => ({
  api: {
    post: (path: string, body: unknown) => post(path, body),
    delete: vi.fn(),
  },
}))

const selected = { rowId: 'row-a', id: 'AAAAAAAA' } as unknown as OrderVM

beforeEach(() => {
  post.mockReset()
})
afterEach(() => cleanup())

function montar(refetchOrders: () => Promise<void>) {
  return renderHook(() =>
    useOrderActions({ selected, supportWhatsapp: null, bizName: 'Pollería', refetchOrders }),
  )
}

describe('useOrderActions · onConfirmDeliveryPayment (CAX-006)', () => {
  it('el POST respondió bien y el refresco no hizo nada: «confirmed», porque manda el servidor', async () => {
    post.mockResolvedValue({
      id: 'row-a',
      status: 'preparing',
      paymentProofStatus: 'verified',
      paymentVerifiedAt: '2026-11-27T20:00:00Z',
    })
    const refetchOrders = vi.fn(async () => {})
    const { result } = montar(refetchOrders)

    let r: 'confirmed' | 'uncertain' | undefined
    await act(async () => {
      r = await result.current.actions.onConfirmDeliveryPayment()
    })

    expect(r).toBe('confirmed')
    expect(post).toHaveBeenCalledWith('/business/orders/row-a/payment-confirmation', undefined)
    expect(refetchOrders).toHaveBeenCalledTimes(1)
  })

  it('el POST bien pero el refresco lanza: sigue «confirmed»', async () => {
    post.mockResolvedValue({
      paymentProofStatus: 'verified',
      paymentVerifiedAt: '2026-11-27T20:00:00Z',
    })
    const { result } = montar(async () => {
      throw new Error('sin señal')
    })

    let r: 'confirmed' | 'uncertain' | undefined
    await act(async () => {
      r = await result.current.actions.onConfirmDeliveryPayment()
    })
    expect(r).toBe('confirmed')
  })

  it('el POST lanza: «uncertain», el refresco se llamó igual y el error se pinta', async () => {
    post.mockRejectedValue(new Error('se cortó'))
    const refetchOrders = vi.fn(async () => {})
    const { result } = montar(refetchOrders)

    let r: 'confirmed' | 'uncertain' | undefined
    await act(async () => {
      r = await result.current.actions.onConfirmDeliveryPayment()
    })

    expect(r).toBe('uncertain')
    expect(refetchOrders).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('Error inesperado')
  })

  it('el POST responde algo que no lo confirma: «uncertain»', async () => {
    post.mockResolvedValue({ paymentProofStatus: 'pending', paymentVerifiedAt: null })
    const { result } = montar(async () => {})

    let r: 'confirmed' | 'uncertain' | undefined
    await act(async () => {
      r = await result.current.actions.onConfirmDeliveryPayment()
    })
    expect(r).toBe('uncertain')
  })
})
