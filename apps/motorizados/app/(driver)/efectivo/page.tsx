'use client'

import { EfectivoList } from '@/features/efectivo/components/efectivo-list'

export default function EfectivoPage() {
  return (
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <h1 className="font-display text-[24px] font-bold tracking-tight">Efectivo</h1>
      </div>
      <EfectivoList />
    </main>
  )
}
