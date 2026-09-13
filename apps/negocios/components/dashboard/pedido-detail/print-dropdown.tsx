'use client'

import { cn, Icon } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import type { OrderVM } from '@/lib/orders/view-model'
import { getAvailablePrintModes, printComanda } from './comanda-ticket'
import type { DetailItem } from './types'

/**
 * Botón unificado de impresión con menú desplegable (dropdown):
 * - Cocina: siempre disponible (preparación e ítems sin precios ni dirección).
 * - Motorizado: disponible SOLO para pedidos de delivery; excluido para pedidos
 *   para llevar / recojo en local (`order.method === 'pickup'`).
 */
export function PrintComandaDropdown({
  order,
  items,
  bizName,
  className,
}: {
  order: OrderVM
  items: DetailItem[]
  bizName?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const availableModes = getAvailablePrintModes(order.method)
  const canPrintMotorizado = availableModes.includes('motorizado')

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Imprimir comanda"
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border/70 bg-white px-2 py-1 text-[11px] font-bold text-ink shadow-xs transition-colors hover:bg-surface active:scale-95',
          open && 'border-border bg-surface',
        )}
      >
        <Icon weight={500} name="receipt_long" size={13} className="text-brand" />
        <span>Imprimir</span>
        <Icon
          weight={500}
          name="expand_more"
          size={13}
          className={cn('text-ink-muted transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-xl border border-border bg-white p-1 shadow-elev-3"
        >
          <div className="border-b border-border/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            Imprimir comanda
          </div>

          <div className="flex flex-col gap-0.5 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                printComanda({ order, items, bizName, mode: 'cocina' })
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface active:bg-surface-high"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                <Icon weight={500} name="restaurant" size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-ink leading-tight">Cocina</div>
                <div className="text-[10px] text-ink-muted leading-tight">Solo preparación</div>
              </div>
            </button>

            {canPrintMotorizado && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  printComanda({ order, items, bizName, mode: 'motorizado' })
                  setOpen(false)
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface active:bg-surface-high"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink/5 text-ink">
                  <Icon weight={500} name="two_wheeler" size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-ink leading-tight">Motorizado</div>
                  <div className="text-[10px] text-ink-muted leading-tight">Despacho y entrega</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
