'use client'

import { useState } from 'react'
import { BottomSheet, ScreenHeader } from '@/components/ui'

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
      <form onSubmit={handleSubmit} className="t-scroll flex-1 px-4 pt-2 pb-6">
        <label className="block">
          <span className="t-field-label">Nombre</span>
          <input
            className="t-field"
            placeholder="Tu nombre"
            value={value}
            maxLength={120}
            autoComplete="name"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block mt-5"
          disabled={!value.trim() || value.trim() === name}
        >
          Guardar
        </button>
      </form>
    </BottomSheet>
  )
}
