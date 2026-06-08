'use client'

import { Segmented } from '@tindivo/ui'
import { RANGES } from '@/lib/labels'

/** Selector de rango (Hoy / 7d / 30d) reutilizando el toggle del cliente. */
export function RangeTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-full sm:w-[260px]">
      <Segmented
        options={RANGES.map(([v, label]) => ({ value: v, label }))}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}
