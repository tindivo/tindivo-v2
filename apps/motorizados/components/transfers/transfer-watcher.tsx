'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, cn } from '@tindivo/ui'
import { useLayoutEffect, useRef } from 'react'
import { useNow } from '@/hooks/use-now'
import { getTransferRemaining, useTeam } from '@/hooks/use-team'
import { api } from '@/lib/api'
import { mmss, soles } from '@/lib/format'
import type { TeamResponse } from '@/lib/types'

type Request = TeamResponse['receivedRequests'][number]

/**
 * Variable que publica la altura de la pila para que el resto de la pantalla se
 * aparte. La escribe este componente y la leen las pestañas y el tablero de
 * `Home`; vale `0px` cuando no hay solicitudes.
 */
const STACK_VAR = '--drv-transfer-h'

/**
 * Pila de solicitudes de traspaso entrantes (HU-D-035/036).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ TODAS Y NO SOLO LA PRIMERA
 *
 *   Antes se pintaba `receivedRequests[0]` y punto. Con dos solicitudes vivas la
 *   segunda era literalmente invisible, y eso no es un problema de comodidad:
 *   el silencio TRANSFIERE el pedido (`expire_order_transfers` llama a
 *   `apply_order_transfer(req, 'expired')`, migración 0119). Un motorizado podía
 *   perder una entrega sin haberla visto nunca.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ TAPA LA BARRA SUPERIOR PERO NO EL TABLERO
 *
 *   La pila va fija arriba del todo, por encima del `GlassTopBar`. Es una
 *   decisión, no un descuido: durante los segundos en que se decide si pierdes
 *   un reparto, la solicitud pesa más que el cromo de la app.
 *
 *   Lo que NO puede tapar es aquello sobre lo que estás decidiendo. Antes cubría
 *   las pestañas y las primeras tarjetas del tablero —se veía en la captura del
 *   gate de T1—, y con una pila de dos o tres habría cubierto la pantalla
 *   entera. Ahora publica su altura en `--drv-transfer-h` y el contenido se
 *   aparta solo.
 */
export function TransferWatcher() {
  const { receivedRequests, refresh } = useTeam()
  const stackRef = useRef<HTMLDivElement | null>(null)

  // `useLayoutEffect` y no `useEffect`: la variable tiene que estar puesta antes
  // del primer pintado, o el tablero da un salto visible al aparecer la pila.
  useLayoutEffect(() => {
    const root = document.documentElement
    const node = stackRef.current
    if (!node) {
      root.style.setProperty(STACK_VAR, '0px')
      return
    }
    // La altura cambia sola: entran y salen solicitudes, y cada card cambia de
    // tamaño al caducar (pierde los botones). Medir una vez no sirve.
    const observer = new ResizeObserver(() => {
      root.style.setProperty(STACK_VAR, `${Math.ceil(node.getBoundingClientRect().height)}px`)
    })
    observer.observe(node)
    root.style.setProperty(STACK_VAR, `${Math.ceil(node.getBoundingClientRect().height)}px`)
    return () => {
      observer.disconnect()
      root.style.setProperty(STACK_VAR, '0px')
    }
    // Depende del NÚMERO de solicitudes, no de `[]`: cuando la pila pasa de 0 a
    // 1 el componente venía devolviendo `null`, así que el `ref` estaba vacío y
    // el observer no llegaba a engancharse nunca.
  }, [receivedRequests.length])

  if (receivedRequests.length === 0) return null

  async function respond(id: string, accept: boolean) {
    try {
      await api.post(`/driver/transfers/${id}/respond`, { accept })
    } catch (err) {
      // Resuelta o caducada justo antes: el refresco la quitará de la pila.
      if (!(err instanceof ApiError)) return
    }
    void refresh()
  }

  return (
    <div
      ref={stackRef}
      className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-[85] mx-auto flex max-w-[480px] flex-col gap-2 p-3"
    >
      {receivedRequests.map((request) => (
        <RequestCard key={request.id} request={request} onRespond={respond} />
      ))}
    </div>
  )
}

function RequestCard({
  request,
  onRespond,
}: {
  request: Request
  onRespond: (id: string, accept: boolean) => void
}) {
  const now = useNow()
  const { remainingSec, pct, expired } = getTransferRemaining(request, now)
  const danger = remainingSec <= 10

  // CADUCADA NO ES "SE CANCELÓ". El backend interpreta el silencio como un sí:
  // el pedido se está pasando al compañero ahora mismo, con hasta un minuto de
  // latencia del cron. Decir "solicitud caducada" —que es lo que decía antes—
  // sugiere lo contrario, y el pedido desaparecía de "Míos" sin explicación.
  if (expired) {
    return (
      <Card className="rounded-[22px] bg-warning p-4 text-white shadow-elev-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]">
              Transferencia automática…
            </p>
            <p className="mt-0.5 text-[14px] font-semibold">
              Pasando el pedido
              {request.shortId ? ` #${request.shortId}` : ''} a {request.requesterName}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="rounded-[22px] bg-ink p-4 text-white shadow-elev-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-light">
          Solicitud de traspaso
        </span>
        <span
          className={cn(
            'font-mono text-[22px] font-bold tabular-nums',
            danger ? 'text-danger' : 'text-warning',
          )}
        >
          {/* `mmss` y no `0:${segundos}`: el TTL es configurable
              (`app_settings.timers.transferTtlSeconds`) y con cualquier valor
              por encima de 59 el formato viejo escribía "0:75". Un contador que
              obliga a traducir mentalmente, justo en el momento de más prisa,
              estorba más de lo que ayuda. Mismo formateador que la tarjeta de
              "Míos": un solo reloj y una sola forma de escribirlo. */}
          {mmss(remainingSec)}
        </span>
      </div>
      <p className="mt-1 text-[14px]">
        {request.requesterName} te pide el pedido
        {request.shortId ? ` #${request.shortId}` : ''}
        {request.total != null ? ` · ${soles(request.total)}` : ''}
      </p>
      <div className="mt-3 h-1.5 rounded-full bg-white/10">
        <div
          className={cn(
            'h-1.5 rounded-full transition-[width] duration-1000 ease-linear',
            danger ? 'bg-danger' : 'bg-brand',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button className="w-full" onClick={() => onRespond(request.id, true)}>
          Aceptar
        </Button>
        <Button
          variant="ghost"
          className="w-full bg-white/10 text-white hover:bg-white/15 hover:text-white"
          onClick={() => onRespond(request.id, false)}
        >
          Rechazar
        </Button>
      </div>
    </Card>
  )
}
