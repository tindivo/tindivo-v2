'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { useOpeningDay } from '../hooks/use-opening-day'

/**
 * Pregunta de apertura de la jornada.
 *
 * Aparece una vez por jornada, mientras el negocio no haya declarado nada. No
 * secuestra el panel: se puede posponer, porque si suena el teléfono con un
 * pedido en curso lo último que ayuda es un modal que no deja trabajar. Al
 * recargar vuelve a preguntar, que es lo que crea el hábito.
 */
export function OpeningPrompt() {
  const { status, loading, saving, error, declare } = useOpeningDay()
  const [postponed, setPostponed] = useState(false)

  if (loading || status !== null || postponed) return null

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-ink/45 p-5">
      <div className="w-full max-w-[380px] rounded-[20px] bg-card p-6 text-center shadow-elev-4">
        <span className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Icon name="store" size={26} filled />
        </span>

        <h3 className="mb-2 text-[17px] font-bold text-ink">¿Abren hoy?</h3>
        {/*
          El copy NO promete que esto cambie lo que ve el cliente, porque
          todavía no lo hace: la declaración se guarda pero aún no está atada
          al catálogo ni al alta de pedidos. Cuando se ate (ver el spec de
          horarios), aquí va "Los clientes solo te verán abierto cuando lo
          confirmes" — y no antes: prometerlo hoy sería enseñarle al negocio a
          desconfiar del panel la primera vez que le entre un pedido tras
          haber dicho que no atendía.
        */}
        <p className="mb-5 text-[14px] leading-relaxed text-ink-muted">
          Confírmanos si van a atender esta noche.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => declare('open')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Icon name="check_circle" size={18} filled />
            Sí, abrimos hoy
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => declare('closed')}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1] disabled:opacity-50"
          >
            Hoy no atendemos
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setPostponed(true)}
            className="mt-0.5 text-[13px] font-semibold text-ink-subtle disabled:opacity-50"
          >
            Decidir más tarde
          </button>
        </div>

        {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
      </div>
    </div>
  )
}
