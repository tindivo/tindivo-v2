'use client'

import { ApiError } from '@tindivo/api-client'
import { isPilotActive, PILOT_FORM_URL, PILOT_LAUNCH_AT } from '@tindivo/contracts'
import { type FormEvent, useEffect, useState } from 'react'
import { persistPilotBypass, resolvePilotBypass } from '@/features/pilot/lib/bypass'
import { api } from '@/lib/api'
import { countdown } from '@/lib/format'

/**
 * Muro del piloto cerrado: cubre la portada con una cuenta regresiva hasta
 * `PILOT_LAUNCH_AT` y deja el catálogo desenfocado detrás, no oculto — la idea
 * es que se vea que hay producto, no una puerta tapiada.
 *
 * SE RENDERIZA EN EL SERVIDOR. El estado inicial sale de `isPilotActive()`, que
 * da lo mismo en servidor y en cliente, así que el muro viaja en el HTML y no
 * hay un parpadeo de "portada primero, muro después". El único texto que depende
 * del reloj exacto es la cuenta regresiva, y por eso lleva
 * `suppressHydrationWarning`: servidor y cliente pueden diferir en un segundo.
 *
 * Para el camino contrario —un dispositivo que YA tiene el bypass y no debería
 * ver el muro ni un instante— el trabajo lo hace el script inline de
 * `app/layout.tsx`, que marca el `<html>` antes del primer pintado y una regla
 * CSS oculta el muro. Aquí, después de montar, el estado se sincroniza.
 *
 * Se desmonta solo cuando llega la hora: el intervalo re-evalúa `isPilotActive()`
 * cada segundo, así que a las 18:00 del 14 el muro desaparece sin deploy.
 *
 * Es un gate de UI. El enforcement real vive en el API (`lib/pilot/gate.ts`).
 */
export function PilotWall() {
  const [open, setOpen] = useState(() => isPilotActive())
  const [remaining, setRemaining] = useState(() => PILOT_LAUNCH_AT.getTime() - Date.now())

  const [phone, setPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bypass ya concedido (token en la URL o visita anterior) -> fuera el muro.
  useEffect(() => {
    if (resolvePilotBypass()) setOpen(false)
  }, [])

  // Reloj: refresca la cuenta y apaga el muro solo al llegar la hora.
  useEffect(() => {
    if (!open) return
    const tick = () => {
      const now = new Date()
      setRemaining(PILOT_LAUNCH_AT.getTime() - now.getTime())
      if (!isPilotActive(now)) setOpen(false)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [open])

  // Bloquea el scroll del fondo mientras el muro esté puesto.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (checking) return
    setError(null)
    setChecking(true)
    try {
      const res = await api.post<{ data: { allowed: boolean } }>('/public/pilot-access', { phone })
      if (res.data.allowed) {
        persistPilotBypass()
        setOpen(false)
        return
      }
      setError('Ese número todavía no está en la lista.')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? 'No pudimos verificar tu número.')
          : 'No pudimos verificar tu número. Revisa tu conexión.',
      )
    } finally {
      setChecking(false)
    }
  }

  if (!open) return null

  return (
    <div
      data-pilot-wall
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Tindivo abre pronto"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-elev-3">
        {/* Cabecera de marca: el degradado naranja del design system. */}
        <div className="bg-gradient-to-br from-brand to-[var(--gradient-brand-to)] px-7 pt-7 pb-6 text-center text-white">
          <div className="font-mono text-micro font-semibold uppercase tracking-[0.2em] opacity-80">
            tindivo · piloto cerrado
          </div>

          <h2 className="mt-3 font-display text-title font-bold leading-[1.1] tracking-[-0.03em]">
            Abrimos para todo
            <br />
            San Jacinto
          </h2>

          <div
            className="mt-5 font-mono text-display font-bold tabular-nums tracking-tight"
            suppressHydrationWarning
          >
            {countdown(remaining)}
          </div>
          <div className="mt-1 text-meta opacity-80">Viernes 14 de agosto, 6:00 p.m.</div>
        </div>

        <div className="px-7 pt-6 pb-7">
          <p className="text-label leading-relaxed text-ink-muted">
            Por ahora atendemos a un grupo de vecinos invitados. Si tu número ya está en la lista,
            escríbelo y entras.
          </p>

          <form onSubmit={handleSubmit} className="mt-4">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-low px-3 focus-within:border-brand">
              <span className="font-mono text-label text-ink-subtle">+51</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={9}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ''))
                  setError(null)
                }}
                placeholder="987654321"
                aria-label="Tu número de celular"
                className="w-full bg-transparent py-3 font-mono text-lead tabular-nums outline-none placeholder:text-ink-subtle"
              />
            </div>

            {error && <p className="mt-2 text-meta text-brand-dark">{error}</p>}

            <button
              type="submit"
              disabled={phone.length !== 9 || checking}
              className="mt-3 w-full rounded-2xl bg-gradient-to-br from-brand to-[var(--gradient-brand-to)] py-3 font-semibold text-body text-white shadow-glow-brand transition disabled:opacity-40 disabled:shadow-none"
            >
              {checking ? 'Verificando…' : 'Entrar'}
            </button>
          </form>

          <a
            href={PILOT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block text-center text-meta text-ink-muted underline underline-offset-4"
          >
            ¿No estás en la lista? Pide tu acceso
          </a>
        </div>
      </div>
    </div>
  )
}
