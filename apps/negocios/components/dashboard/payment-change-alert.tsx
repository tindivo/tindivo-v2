'use client'

import { cn, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { setPaymentChangeListener } from '@/lib/payment-change-bus'

// El pub/sub en sí vive en `lib/payment-change-bus.ts`, y no aquí: ver por qué
// en su cabecera. Este host solo se suscribe.
//
// UN HOST APARTE, Y NO EL DE ÉXITO. El toast verde es una confirmación de algo
// que la cajera ACABA de pedir con el dedo — 3s bastan porque ya sabe qué
// esperar. Esto es lo contrario: una noticia que nadie pidió, sobre dinero que
// va a entrar distinto de lo pactado, y que además viene con un pitido para
// que se note aunque la cajera esté mirando otra pantalla. Se queda más tiempo
// y se ve claramente distinto (ámbar, no verde) para que no se lea como un
// "listo, seguimos" cualquiera.

/** Host único, en el chrome persistente, igual que `SuccessToastHost`. */
export function PaymentChangeAlertHost() {
  const [alert, setAlert] = useState<{ text: string; id: number } | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    setPaymentChangeListener((text) => {
      if (timer) clearTimeout(timer)
      setAlert({ text, id: Date.now() })
      timer = setTimeout(() => setAlert(null), 6000)
    })
    return () => {
      setPaymentChangeListener(null)
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!alert) {
      setShown(false)
      return
    }
    setShown(false)
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [alert])

  if (!alert) return null
  return (
    <div
      key={alert.id}
      role="status"
      className={cn(
        // `top-[112px]`, no los `62px` del toast de éxito: los dos hosts son
        // independientes y pueden coincidir (una acción de la cajera Y un
        // motorizado cambiando el cobro casi al mismo tiempo); con el mismo
        // offset uno taparía al otro en vez de apilarse.
        'pointer-events-none fixed left-1/2 top-[112px] z-[300] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300 bg-amber-400 px-4 py-2.5 text-sm font-bold text-amber-950 shadow-[0_8px_24px_-6px_rgba(217,119,6,0.55)] transition-[transform,opacity] duration-200',
        shown ? 'translate-y-0 opacity-100' : '-translate-y-2.5 opacity-0',
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1), ease',
      }}
    >
      <Icon name="priority_high" size={18} filled />
      <span className="truncate">{alert.text}</span>
    </div>
  )
}
