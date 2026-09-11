'use client'

import { Button, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { usePwaInstall } from '@/hooks/use-pwa-install'

const DISMISSED_KEY = 'tindivo:pwa:install-dismissed'
/**
 * El descarte CADUCA. Se guarda un timestamp, no un booleano: una cajera que
 * cierra el banner el primer día no puede quedarse sin avisos para siempre.
 */
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    if (!raw) return null
    const ts = Number(raw)
    return Number.isFinite(ts) ? ts : null
  } catch {
    return null
  }
}

function rememberDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  } catch {
    // Modo privado de Safari — se volverá a enseñar. Preferible a no cerrarse.
  }
}

/**
 * Invita a instalar la PWA. Copiado de `apps/motorizados/components/pwa/install-banner.tsx`
 * (0227) — no existía en `negocios`, y por eso el push nunca funcionó en un
 * iPhone o iPad del mostrador aunque el permiso se concediera: en iOS, Safari
 * SOLO entrega Web Push a una PWA que corre en modo standalone (agregada a la
 * pantalla de inicio), nunca a una pestaña normal. Sin este aviso, quien abre
 * el panel desde Safari se queda ahí para siempre y ninguna corrección del
 * lado del permiso cambia nada.
 *
 * Se monta en el layout, así que aparece en todas las rutas.
 */
export function InstallBanner() {
  const { ready, isStandalone, isIOS, canPrompt, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(false)
  const [checkedStorage, setCheckedStorage] = useState(false)

  useEffect(() => {
    const at = readDismissedAt()
    setDismissed(at !== null && Date.now() - at < DISMISS_TTL_MS)
    setCheckedStorage(true)
  }, [])

  function dismiss() {
    rememberDismissed()
    setDismissed(true)
  }

  if (!ready || !checkedStorage) return null
  if (isStandalone) return null
  if (dismissed) return null
  // Ni iOS ni un Chrome que haya ofrecido instalar: no hay nada que proponer.
  if (!isIOS && !canPrompt) return null

  return (
    <div
      className="fixed inset-x-3 z-40"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      <div className="mx-auto flex max-w-[456px] items-start gap-3 rounded-[18px] border border-ink/[0.06] bg-ink px-4 py-3 text-white shadow-elev-3">
        {/* `install_mobile` no está en el subset de `negocios` (icons.txt) —
            `smartphone` sí. Ver el invariante 9 de CLAUDE.md. */}
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/25 text-brand-light">
          <Icon name="smartphone" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug">
            {isIOS ? (
              <>
                Instala Tindivo Negocio para recibir avisos de pedidos. Toca{' '}
                <span className="font-semibold">Compartir</span> y luego{' '}
                <span className="font-semibold">Añadir a pantalla de inicio</span>.
              </>
            ) : (
              'Instala Tindivo Negocio para recibir avisos de pedidos.'
            )}
          </p>
          {/* iOS no deja instalar por API: solo se puede explicar el gesto. */}
          {!isIOS && (
            <Button
              size="sm"
              className="mt-2.5"
              onClick={() => {
                void promptInstall()
              }}
            >
              Instalar
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="-mr-1 shrink-0 rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  )
}
