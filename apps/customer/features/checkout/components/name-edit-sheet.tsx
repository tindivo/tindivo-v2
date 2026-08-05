'use client'

import { BottomSheet, Button, ScreenHeader } from '@tindivo/ui'
import { useState } from 'react'

interface NameEditSheetProps {
  name: string
  open: boolean
  onClose: () => void
  onSave: (name: string) => void
}

export function NameEditSheet({ name, open, onClose, onSave }: NameEditSheetProps) {
  const [value, setValue] = useState(name)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSave(trimmed)
    onClose()
  }

  if (!open) return null
  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title="Editar nombre" onBack={onClose} />
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto px-4 pt-2 pb-6 scrollbar-hide"
      >
        <label className="block">
          <span className="block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Nombre
          </span>
          <input
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            placeholder="Tu nombre"
            value={value}
            maxLength={120}
            autoComplete="name"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          variant="brand"
          className="mt-5 w-full"
          disabled={!value.trim() || value.trim() === name}
        >
          Guardar
        </Button>
      </form>
    </BottomSheet>
  )
}
