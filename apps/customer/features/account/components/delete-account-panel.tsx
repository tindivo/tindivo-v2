'use client'

import { ApiError } from '@tindivo/api-client'
import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { signOutDevice } from '@/lib/sign-out'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { getSupportWhatsapp } from '@/lib/support'

/** La palabra que hay que escribir: un toque sin querer no borra una cuenta. */
export const CONFIRM_WORD = 'BORRAR'

type Phase = 'loading' | 'signed-out' | 'ready' | 'working' | 'done'

/**
 * El panel de /borrar-cuenta: iniciar sesión si falta, confirmar escribiendo
 * «BORRAR» y llamar a `DELETE /customer/account`. Los motivos del 409 vienen de
 * la API ya en español, y se muestran tal cual.
 */
export function DeleteAccountPanel() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wa, setWa] = useState(TINDIVO_SUPPORT_WHATSAPP)

  useEffect(() => {
    getSupportWhatsapp().then(setWa)
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => setPhase(data.session ? 'ready' : 'signed-out'))
  }, [])

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD

  async function handleDelete() {
    if (!confirmed) return
    setPhase('working')
    setError(null)
    try {
      await api.request<void>('/customer/account', { method: 'DELETE' })
      // La cuenta ya no existe: solo queda soltar el aparato. Un fallo aquí no
      // importa (el token ya no vale), así que no se muestra como error.
      await signOutDevice().catch(() => undefined)
      setPhase('done')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos borrar tu cuenta. Revisa tu conexión e inténtalo de nuevo.',
      )
      setPhase('ready')
    }
  }

  const whatsappUrl = `https://wa.me/${wa}?text=${encodeURIComponent('Hola Tindivo, quiero borrar mi cuenta y mis datos. ')}`

  return (
    <section className="mt-8 rounded-[18px] border border-border bg-card p-5">
      {phase === 'loading' && <p className="text-[14px] text-ink-muted">Cargando…</p>}

      {phase === 'signed-out' && (
        <>
          <p className="text-[14px] leading-[1.55] text-ink/75">
            Para borrar tu cuenta primero tienes que iniciar sesión, para que sepamos que eres tú.
          </p>
          <Link
            href="/entrar?next=/borrar-cuenta"
            className="mt-3 inline-flex rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white"
          >
            Iniciar sesión
          </Link>
        </>
      )}

      {(phase === 'ready' || phase === 'working') && (
        <>
          <p className="text-[14px] leading-[1.55] text-ink/75">
            Esto no se puede deshacer. Para confirmar, escribe{' '}
            <strong className="text-ink">{CONFIRM_WORD}</strong>.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label={`Escribe ${CONFIRM_WORD} para confirmar`}
            disabled={phase === 'working'}
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-brand"
          />
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={!confirmed || phase === 'working'}
            className="mt-3 w-full"
          >
            {phase === 'working' ? 'Borrando…' : 'Borrar mi cuenta definitivamente'}
          </Button>
        </>
      )}

      {phase === 'done' && (
        <p role="status" className="text-[14px] leading-[1.55] text-ink">
          Listo: tu cuenta se borró y tus pedidos quedaron sin tu nombre. Gracias por haber usado
          Tindivo.
        </p>
      )}

      <p className="mt-4 text-[13px] text-ink-muted">
        ¿No puedes iniciar sesión?{' '}
        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="text-brand underline">
          Escríbenos por WhatsApp
        </a>{' '}
        y lo hacemos por ti.
      </p>
    </section>
  )
}
