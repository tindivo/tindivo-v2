'use client'

import { useState } from 'react'
import { BottomSheet, ScreenHeader } from '@/components/ui'

interface ProfileEditSheetProps {
  name: string
  onClose: () => void
  onSave: (name: string) => void | Promise<void>
}

export function ProfileEditSheet({ name, onClose, onSave }: ProfileEditSheetProps) {
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) {
      onClose()
      return
    }
    setBusy(true)
    await onSave(trimmed)
    setBusy(false)
    onClose()
  }

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title="Editar perfil" onBack={onClose} />
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
          disabled={busy || !value.trim() || value.trim() === name}
        >
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </BottomSheet>
  )
}
