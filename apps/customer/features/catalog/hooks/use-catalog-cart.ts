'use client'

import { useEffect, useRef, useState } from 'react'
import type { MenuItem } from '@/features/catalog/types'
import type { CartLine } from '@/lib/cart'
import { useCart } from '@/lib/cart'

export function useCatalogCart(businessId: string | undefined, businessName: string | undefined) {
  const cart = useCart()
  const [modalItem, setModalItem] = useState<MenuItem | null>(null)
  const [pending, setPending] = useState<Omit<CartLine, 'key'> | null>(null)
  const [addedToast, setAddedToast] = useState<{ name: string; id: number } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  function notifyAdded(name: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setAddedToast({ name, id: Date.now() })
    toastTimer.current = setTimeout(() => setAddedToast(null), 2200)
  }

  function handleAdd(line: Omit<CartLine, 'key'>) {
    if (!businessId || !businessName) return
    if (cart.businessId && cart.businessId !== businessId && cart.lines.length > 0) {
      setPending(line)
      setModalItem(null)
      return
    }
    cart.addLine(businessId, businessName, line)
    notifyAdded(line.name)
    setModalItem(null)
  }

  function confirmReplace(line: Omit<CartLine, 'key'>) {
    if (!businessId || !businessName) return
    cart.addLine(businessId, businessName, line)
    notifyAdded(line.name)
    setPending(null)
  }

  return {
    cart,
    modalItem,
    setModalItem,
    pending,
    setPending,
    addedToast,
    handleAdd,
    confirmReplace,
  }
}
