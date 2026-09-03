'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { useDialogFocus } from './use-dialog-focus'

/**
 * Bottom-sheet modal (slideUp). Cierra al click fuera o Escape.
 *
 * `label` ES OBLIGATORIA, y por eso es una prop y no una revisión.
 *
 * Este `div` lleva `role="dialog"` y `aria-modal="true"` desde siempre, pero no
 * tenía nombre: un lector de pantalla anunciaba «diálogo» y nada más. Quien no
 * ve la pantalla se quedaba sin saber qué acababa de abrirse — y estas hojas son
 * el sitio donde se confirma una entrega, se suelta un pedido o se reclama una
 * cobertura, no adornos.
 *
 * Se exige por tipo y no por convención porque eran VEINTISÉIS hojas en tres
 * apps y ninguna lo tenía: si el guardarraíl vive en la revisión, la número 27
 * nace sin nombre igual. Así el compilador da el inventario gratis.
 *
 * CÓMO ELEGIR EL VALOR. Si la hoja ya pinta un título, pásale ESE mismo texto
 * —lo suyo es subirlo a una constante que usen el encabezado y esta prop, para
 * que no puedan separarse—. Si el título es dinámico, la etiqueta también lo es.
 */
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose?: () => void
  /** Cómo se llama esta hoja para quien no la ve. Obligatoria a propósito. */
  label: string
  children: ReactNode
}) {
  const caja = useRef<HTMLDivElement>(null)
  // Mete el foco, escucha Escape en `document` y lo devuelve al cerrar. Lo de
  // Escape no es un extra: el `onKeyDown` de abajo solo recibe la tecla si el
  // foco YA está dentro, así que hasta ahora esta hoja prometía cerrarse con
  // Escape y no lo hacía mientras nadie la tocara.
  useDialogFocus(caja, { open, onClose })

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
    <div
      className="fixed inset-0 z-80 flex items-end justify-center bg-ink/35 animate-[t-fade-in_200ms_ease] backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
    >
      <div
        ref={caja}
        // `tabIndex={-1}` para poder enfocar la caja sin meterla en el orden de
        // tabulación, y sin anillo: el foco está aquí para anunciar el diálogo,
        // no para señalar un control.
        tabIndex={-1}
        className="flex w-full max-w-[768px] max-h-[85dvh] min-h-0 flex-col overflow-hidden rounded-t-[28px] bg-surface text-ink shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.35)] animate-[t-slide-up_280ms_cubic-bezier(0.22,1,0.36,1)] overscroll-contain focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-8 rounded-full bg-ink/20" />
        </div>
        {children}
      </div>
    </div>
  )
}
