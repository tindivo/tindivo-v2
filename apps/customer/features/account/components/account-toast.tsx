'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'

interface AccountToastProps {
  message: string
  onDone?: () => void
}

export function AccountToast({ message, onDone }: AccountToastProps) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    const timer = setTimeout(() => {
      setShown(false)
      setTimeout(() => onDone?.(), 240)
    }, 2200)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [onDone])

  return (
    <div
      data-show={shown}
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex translate-y-[-14px] justify-center px-4 opacity-0 transition-[transform,opacity] duration-240 ease-out data-[show=true]:translate-y-0 data-[show=true]:opacity-100"
    >
      <div className="flex max-w-[92%] items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.28)]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">
          <Icon name="check" size={20} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[14px] leading-tight">{message}</div>
        </div>
      </div>
    </div>
  )
}
