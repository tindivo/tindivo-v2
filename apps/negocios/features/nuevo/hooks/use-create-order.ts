'use client'

import { ApiError } from '@tindivo/api-client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import {
  clearIdempotencyKey,
  getOrCreateIdempotencyKey,
  mapFormError,
  num,
  regenerateIdempotencyKey,
} from '../lib/format'
import type { Payment } from '../types'

export interface CreateOrderPayload {
  prep: number
  name: string
  phone: string
  reference: string
  payment: Payment
  amount: string
  paysWith: string
  walletPart: string
  cashPart: string
}

export function useCreateOrder() {
  const router = useRouter()
  const submittingRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (payload: CreateOrderPayload, canSubmit: boolean) => {
    if (submittingRef.current || !canSubmit) return
    submittingRef.current = true
    setBusy(true)
    setError(null)

    const deliveryMethod = 'delivery'
    const amountN = num(payload.amount)
    const isCashish = payload.payment === 'pending_cash' || payload.payment === 'pending_mixed'
    const cleanPhone = payload.phone.replace(/\D/g, '')

    const idempotencyKey = getOrCreateIdempotencyKey()
    const orderPayload = {
      deliveryMethod,
      paymentIntent: payload.payment === 'pending_wallet' ? 'pending_yape' : payload.payment,
      customerName: payload.name.trim() || undefined,
      customerPhone: cleanPhone || undefined,
      deliveryReference: payload.reference.trim() || undefined,
      prepTimeMinutes: payload.prep,
      orderAmount: amountN,
      clientPaysWith: isCashish && num(payload.paysWith) > 0 ? num(payload.paysWith) : undefined,
      yapeAmount: payload.payment === 'pending_mixed' ? num(payload.walletPart) : undefined,
      cashAmount: payload.payment === 'pending_mixed' ? num(payload.cashPart) : undefined,
    }

    try {
      await api.post('/business/orders', orderPayload, idempotencyKey)
      clearIdempotencyKey()
      router.replace('/')
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'idempotency_conflict' ||
          (err.status === 409 && err.message.toLowerCase().includes('idempotency'))
        ) {
          const freshKey = regenerateIdempotencyKey()
          try {
            await api.post('/business/orders', orderPayload, freshKey)
            clearIdempotencyKey()
            router.replace('/')
            return
          } catch (retryErr) {
            if (retryErr instanceof ApiError && retryErr.status >= 400 && retryErr.status < 500) {
              regenerateIdempotencyKey()
            }
            setError(mapFormError(retryErr))
            setBusy(false)
            submittingRef.current = false
            return
          }
        }
        if (err.status >= 400 && err.status < 500) {
          regenerateIdempotencyKey()
        }
      }
      setError(mapFormError(err))
      setBusy(false)
      submittingRef.current = false
    }
  }

  return { submit, busy, error }
}
