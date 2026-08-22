'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { AttentionBannerVM } from '@/lib/orders/attention'
import type { OrderVM } from '@/lib/orders/view-model'

/**
 * LA SUPERFICIE QUE ACOMPAÑA A LA ALARMA, EN TODAS LAS RUTAS.
 *
 * Sustituye a dos cosas que no bastaban (ver `lib/orders/attention.ts` para el
 * incidente que lo motiva):
 *
 *   · `NewOrderToast`, que duraba SEIS SEGUNDOS y solo se disparaba en el flanco
 *     de subida. El sonido dura lo que dure el pedido —cinco minutos— así que el
 *     aviso se apagaba con el pedido todavía vivo y sonando.
 *   · La barra roja de `PedidosDesktop`, que decía lo mismo pero solo existía en
 *     `/`. Justo la ruta donde las tarjetas ya se ven y menos falta hacía.
 *
 * Ahora hay UNA superficie, la pinta el chrome, y su condición es exactamente la
 * que enciende el sonido. No puede haber alarma sin ella.
 *
 * VIVE POR ENCIMA DEL DETALLE (`z-[300]` contra el `z-[200]` de `DetailScreen`)
 * a propósito: con la ficha de otro pedido abierta a pantalla completa en móvil,
 * el tablero de debajo no se ve, y ese es uno de los caminos por los que la
 * alarma se quedaba sola.
 *
 * No decide NADA por su cuenta: la decisión vive en `attentionState`, que la
 * emite en la misma llamada que enciende el sonido. Eso es lo que hace
 * comprobable el invariante sin montar React.
 */
export function AttentionBanner({
  vm,
  onOpen,
}: {
  /** `attentionState(vms).banner`. `null` = no hay alarma, no hay banner. */
  vm: AttentionBannerVM | null
  /** Abre el pedido sin cambiar de ruta. Sin esto, el banner navega a `/`. */
  onOpen?: (o: OrderVM) => void
}) {
  if (!vm) return null

  const inner = (
    <>
      <Icon
        name="notifications_active"
        size={20}
        weight={500}
        filled
        className="shrink-0 animate-pulse"
      />
      <span className="min-w-0 flex-1 truncate text-left">{vm.label}</span>
      <span className="shrink-0 font-mono text-[15px] font-black tabular-nums">
        {vm.countdownText}
      </span>
      <span className="shrink-0 rounded-lg bg-white/25 px-2 py-1 text-[12px] font-bold">Ver</span>
    </>
  )

  const shell =
    'flex w-full items-center gap-2.5 rounded-2xl bg-danger px-3.5 py-2.5 text-[14px] ' +
    'font-bold text-white no-underline shadow-[0_10px_30px_-8px_rgba(220,38,38,0.7)] ' +
    'transition-transform active:scale-[0.99]'

  // El `role="alert"` va en el CONTENEDOR, no en el control: puesto sobre el
  // `button` o el `Link` les pisa el rol nativo y el lector de pantalla deja de
  // anunciarlos como algo que se puede pulsar. Aquí anuncia la aparición del
  // aviso y el control de dentro conserva el suyo.
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-3 z-[300] w-[min(560px,calc(100vw-24px))] -translate-x-1/2"
    >
      {onOpen ? (
        <button type="button" onClick={() => onOpen(vm.target)} className={shell}>
          {inner}
        </button>
      ) : (
        <Link href="/" className={shell}>
          {inner}
        </Link>
      )}
    </div>
  )
}
