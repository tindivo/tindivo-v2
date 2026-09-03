'use client'

import { type RefObject, useEffect } from 'react'

/** Lo que puede recibir el foco dentro de un diálogo. */
const FOCUSABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * El foco, mientras una capa modal está abierta.
 *
 * TRES COSAS, Y LAS TRES FALTABAN.
 *
 *   1. ENTRAR. Al abrirse, el foco seguía donde estaba: en el botón de detrás,
 *      fuera de la capa. Para quien navega con teclado la hoja aparecía y no
 *      pasaba nada; para un lector de pantalla, tampoco.
 *
 *   2. ESCAPE. Y esto no era solo accesibilidad: `BottomSheet` escuchaba la
 *      tecla con un `onKeyDown` en su `div`, y un evento de teclado solo llega
 *      ahí si el foco YA está dentro. Como nadie lo metía, **Escape no cerraba
 *      nada** hasta que el usuario tocaba algo de la hoja. El componente decía
 *      «cierra al click fuera o Escape» y cumplía la mitad. Aquí se escucha en
 *      `document`, que es donde llega siempre.
 *
 *   3. VOLVER. Al cerrarse, el foco se quedaba en un elemento que ya no existe
 *      y el navegador lo devolvía a `body`: el siguiente Tab empezaba desde el
 *      principio de la página, no desde donde estabas.
 *
 * SE ENFOCA EL CONTENEDOR, NO EL PRIMER CAMPO. Enfocar el primer `input` abre
 * el teclado del móvil nada más aparecer la hoja, tapa media pantalla y esconde
 * justo lo que la persona iba a leer. El contenedor con `tabIndex={-1}` deja el
 * anuncio hecho, Escape vivo y el primer Tab entrando por el primer control.
 *
 * EL CICLO ES `Tab`, no una jaula: sale por Escape o por el botón de cerrar,
 * como cualquier diálogo.
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  { open, onClose }: { open: boolean; onClose?: () => void },
) {
  useEffect(() => {
    if (!open) return
    const caja = ref.current
    if (!caja) return

    const previo = document.activeElement as HTMLElement | null
    // En el mismo frame en que se monta, el navegador todavía puede estar
    // colocando la capa; `requestAnimationFrame` evita enfocar algo que aún no
    // está en su sitio y que el scroll salte.
    const frame = requestAnimationFrame(() => caja.focus({ preventScroll: true }))

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !caja) return
      const focusables = [...caja.querySelectorAll<HTMLElement>(FOCUSABLES)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusables.length === 0) {
        // Sin nada que enfocar dentro, el Tab se llevaría el foco a la página de
        // detrás. Se queda en la caja.
        e.preventDefault()
        caja.focus({ preventScroll: true })
        return
      }
      // `noUncheckedIndexedAccess`: el array tiene al menos uno —lo garantiza el
      // `length === 0` de arriba— pero el tipo no lo sabe.
      const primero = focusables[0]
      const ultimo = focusables[focusables.length - 1]
      if (!primero || !ultimo) return
      const activo = document.activeElement
      if (e.shiftKey && (activo === primero || activo === caja)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      // `isConnected`: si la pantalla de la que veníamos también se desmontó,
      // devolverle el foco no haría nada y encima tiraría un error en algunos
      // navegadores.
      if (previo?.isConnected) previo.focus({ preventScroll: true })
    }
  }, [open, onClose, ref])
}
