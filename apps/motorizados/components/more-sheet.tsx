'use client'

import { signOutLocal } from '@tindivo/supabase'
import { BottomSheet, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface MoreSheetProps {
  open: boolean
  onClose: () => void
  activePath?: string
}

export function MoreSheet({ open, onClose, activePath }: MoreSheetProps) {
  const router = useRouter()
  const push = usePushSubscription()

  const handleLogout = async () => {
    if (!confirm('¿Cerrar sesión?')) return
    try {
      await Promise.race([push.unsubscribe(), new Promise((resolve) => setTimeout(resolve, 3000))])
    } catch (err) {
      console.error('[MoreSheet] error al dar de baja push:', err)
    }
    await signOutLocal(getSupabaseBrowser())
    onClose()
    router.replace('/')
  }

  if (!open) return null

  return (
    <BottomSheet open onClose={onClose}>
      <div className="flex flex-col px-5 pt-2 pb-8">
        {/* Header del BottomSheet */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="min-w-0">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Panel del motorizado
            </span>
            <h3 className="truncate font-display text-[17px] font-bold text-ink">Más opciones</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted hover:bg-ink/[0.12] cursor-pointer"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Opciones del menú */}
        <div className="mt-3 flex flex-col gap-2">
          {/* Opción: Restaurantes */}
          <Link
            href="/restaurantes"
            onClick={onClose}
            className={`flex items-center gap-3.5 rounded-2xl p-3.5 transition-colors ${
              activePath === '/restaurantes'
                ? 'bg-ink text-white'
                : 'bg-surface hover:bg-ink/[0.04] text-ink border border-border/70'
            }`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                activePath === '/restaurantes'
                  ? 'bg-white/15 text-white'
                  : 'bg-brand/10 text-brand-dark'
              }`}
            >
              <Icon name="storefront" size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold leading-tight">Restaurantes asignados</div>
              <div
                className={`mt-0.5 text-[12px] ${
                  activePath === '/restaurantes' ? 'text-white/70' : 'text-ink-muted'
                }`}
              >
                Contactos, direcciones y QRs de cobro
              </div>
            </div>
            <Icon
              name="chevron_right"
              size={20}
              className={activePath === '/restaurantes' ? 'text-white/50' : 'text-ink-muted'}
            />
          </Link>

          {/* Opción: Mi Perfil */}
          <Link
            href="/perfil"
            onClick={onClose}
            className={`flex items-center gap-3.5 rounded-2xl p-3.5 transition-colors ${
              activePath === '/perfil'
                ? 'bg-ink text-white'
                : 'bg-surface hover:bg-ink/[0.04] text-ink border border-border/70'
            }`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                activePath === '/perfil' ? 'bg-white/15 text-white' : 'bg-ink/[0.06] text-ink'
              }`}
            >
              <Icon name="person" size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold leading-tight">Mi Perfil</div>
              <div
                className={`mt-0.5 text-[12px] ${
                  activePath === '/perfil' ? 'text-white/70' : 'text-ink-muted'
                }`}
              >
                Disponibilidad, notificaciones y cuenta
              </div>
            </div>
            <Icon
              name="chevron_right"
              size={20}
              className={activePath === '/perfil' ? 'text-white/50' : 'text-ink-muted'}
            />
          </Link>
        </div>

        {/* Pie: Cerrar sesión */}
        <div className="mt-5 border-t border-border pt-3.5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-low border border-border py-2.5 text-[14px] font-semibold text-danger hover:bg-danger-soft transition-colors cursor-pointer"
          >
            <Icon name="logout" size={18} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
