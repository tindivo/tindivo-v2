'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { saveGoogleName } from '../persistence'

const NAME_RE = /^[\p{L}\s'.-]+$/u

/** Camino Google: confirmar el nombre que aparecerá en el pedido. */
export function GoogleNameStep({
  active,
  initialName,
  userId,
  onDone,
}: {
  active: boolean
  initialName: string | null
  userId: string | null
  onDone: (fullName: string) => void
}) {
  const [name, setName] = useState(initialName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El nombre de Google llega async (resume): prellenar cuando aparezca.
  useEffect(() => {
    if (initialName) setName((cur) => cur || initialName)
  }, [initialName])

  const trimmed = name.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= 40 && NAME_RE.test(trimmed)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy || !userId) return
    setBusy(true)
    setError(null)
    try {
      await saveGoogleName({ userId, fullName: trimmed })
      onDone(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar tu nombre')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <h2 className="t-display text-[24px] leading-[1.1]">¿Cómo te llamamos?</h2>
        <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          Este nombre aparecerá en tu pedido.
        </p>

        <label className="mt-5 block">
          <span className="t-field-label">
            Nombre <span style={{ color: '#F97316' }}>*</span>
          </span>
          <input
            className="t-field"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            autoComplete="name"
            maxLength={40}
            tabIndex={active ? 0 : -1}
          />
        </label>
        <div
          className="mt-1.5 flex justify-between text-[12px]"
          style={{ color: 'rgba(26,22,20,0.5)' }}
        >
          <span>Mínimo 2 caracteres, solo letras.</span>
          <span className="tabular-nums">{name.length}/40</span>
        </div>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>

      <div className="border-t px-4 pt-3.5 pb-6" style={{ borderColor: 'rgba(26,22,20,0.06)' }}>
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    </form>
  )
}
