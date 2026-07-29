'use client'

import { ScreenHeader } from '@tindivo/ui'
import Link from 'next/link'
import type { Tracking } from '@/features/tracking/types'

interface TrackingShellProps {
  title: string
  onBack: () => void
  error: string | null
  data: Tracking | null
  children: React.ReactNode
}

export function TrackingShell({ title, onBack, error, data, children }: TrackingShellProps) {
  if (error && !data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16 text-center">
        <p className="text-ink-muted">{error}</p>
        <Link href="/" className="mt-4 inline-block font-semibold text-brand">
          Volver al inicio
        </Link>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-12">
        <div className="h-48 animate-pulse rounded-[22px] bg-card" />
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16 lg:max-w-[1040px]">
      <ScreenHeader title={title} onBack={onBack} />
      {children}
    </main>
  )
}
