'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  scrim = true,
}: {
  open: boolean
  onClose?: () => void
  /** Cómo se llama esta hoja para quien no la ve. Obligatoria a propósito. */
  label: string
  children: ReactNode
  /**
   * `false` quita el fondo oscuro (`bg-ink/35 backdrop-blur-sm`) Y el cierre
   * al clic fuera: sigue siendo portal, sigue atrapando el foco, sigue
   * cerrando con Escape. Es para hojas que flotan sobre un mapa persistente
   * (Tindivo Entregas) en vez de sobre lo que hubiera detrás — el mapa tiene
   * que quedar visible y TOCABLE, no tapado por un scrim pensado para un
   * fondo cualquiera.
   *
   * El backdrop pasa a `pointer-events-none` en vez de solo perder el color:
   * antes seguía siendo el elemento de pantalla completa más alto (z-80) y
   * capturaba cualquier gesto sobre el mapa, así que arrastrar el mapa detrás
   * de la hoja no solo no lo movía — CERRABA la hoja entera, porque el mismo
   * div escuchaba el clic para eso. `pointer-events-auto` en la caja de abajo
   * la deja interactiva igual, aunque su padre ya no lo sea.
   */
  scrim?: boolean
}) {
  const caja = useRef<HTMLDivElement>(null)
  /**
   * ESTA HOJA SE CUELGA DE `document.body`, Y NO ES UN CAPRICHO.
   *
   * `position: fixed` promete «respecto a la pantalla», pero deja de cumplirlo
   * en cuanto un ANTEPASADO tiene `transform`, `filter`, `backdrop-filter`,
   * `contain` o `will-change`: cualquiera de esos convierte al antepasado en el
   * bloque contenedor, y la hoja pasa a colocarse dentro de ÉL.
   *
   * Visto el 2026-09-04. El pie de la bolsa lleva `backdrop-blur-3xl` y dentro
   * van los botones que abren las hojas-puerta; la de la dirección se anclaba a
   * ese pie en vez de a la pantalla, y el resultado era una pantalla mezclada:
   * la cabecera «Mi bolsa» pintada ENCIMA del formulario de dirección, el
   * rótulo «ETIQUETA» cortado por arriba y el vecino escribiendo su dirección
   * bajo el título de otra pantalla. Reproducido a 640 px de alto.
   *
   * Al portalizar, el antepasado deja de existir para el posicionamiento y la
   * promesa de `fixed` vuelve a ser cierta pase lo que pase por encima. Vale
   * para las 32 hojas, no solo para la que se rompió: la siguiente que alguien
   * abra desde dentro de un elemento con filtro ya nace bien.
   *
   * El `montado` es por el render del servidor, donde no hay `document`. No
   * cuesta un parpadeo: `open` ya es false en el primer render de todas ellas
   * —se abren al tocar algo—, así que nunca hay una hoja abierta que retrasar.
   */
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
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

  if (!open || !montado) return null
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera (solo con scrim)
    <div
      className={`fixed inset-0 z-80 flex items-end justify-center animate-[t-fade-in_200ms_ease] ${
        scrim ? 'bg-ink/35 backdrop-blur-sm' : 'pointer-events-none'
      }`}
      role="presentation"
      onClick={(e) => {
        if (scrim && e.target === e.currentTarget && onClose) onClose()
      }}
    >
      <div
        ref={caja}
        // `tabIndex={-1}` para poder enfocar la caja sin meterla en el orden de
        // tabulación, y sin anillo: el foco está aquí para anunciar el diálogo,
        // no para señalar un control.
        tabIndex={-1}
        className="pointer-events-auto flex w-full max-w-[768px] max-h-[85dvh] min-h-0 flex-col overflow-hidden rounded-t-[28px] bg-surface text-ink shadow-[0_-20px_60px_-40px_rgba(0,0,0,0.35)] animate-[t-slide-up_280ms_cubic-bezier(0.22,1,0.36,1)] overscroll-contain focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-8 rounded-full bg-ink/20" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
