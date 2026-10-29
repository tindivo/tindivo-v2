'use client'

import { UpdateCustomerProfileRequestSchema } from '@tindivo/contracts'
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
  const [error, setError] = useState<string | null>(null)
  const valid = UpdateCustomerProfileRequestSchema.shape.fullName.safeParse(value).success

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) {
      onClose()
      return
    }
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar tu nombre.')
    } finally {
      setBusy(false)
    }
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
            maxLength={40}
            autoComplete="name"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <p className="mt-1.5 text-[12px] text-ink-muted">Mínimo 2 caracteres, solo letras.</p>
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        <Button
          type="submit"
          variant="brand"
          className="mt-5 w-full"
          disabled={busy || !valid || value.trim() === name}
        >
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>
    </BottomSheet>
  )
}
