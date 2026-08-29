'use client'

import { BottomSheet, Button, ScreenHeader } from '@tindivo/ui'
import { useState } from 'react'

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
    <BottomSheet open label="Editar perfil" onClose={onClose}>
      <ScreenHeader title="Editar perfil" onBack={onClose} as="h2" />
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-2 pb-6"
      >
        <label className="block">
          <span className="block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted mb-2">
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
          disabled={busy || !value.trim() || value.trim() === name}
        >
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>
    </BottomSheet>
  )
}
