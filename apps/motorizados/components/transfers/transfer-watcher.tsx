'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, cn, Icon } from '@tindivo/ui'
import { useNow } from '@/hooks/use-now'
import { getTransferRemaining, useTeam } from '@/hooks/use-team'
import { api } from '@/lib/api'
import { mmss, soles } from '@/lib/format'
import type { TeamResponse } from '@/lib/types'

type Request = TeamResponse['receivedRequests'][number]

/**
 * Solicitudes de traspaso entrantes (HU-D-035/036), a PANTALLA COMPLETA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN MODAL Y NO EL BANNER QUE HABÍA
 *
 *   Desde la 0130 el silencio TRANSFIERE el pedido, y la ventana son 30
 *   segundos. O sea: no responder ya no es neutral, cuesta el reparto. Con esa
 *   regla, que la solicitud se vea deja de ser una mejora de UX y pasa a ser
 *   parte del contrato: un banner que compite con el resto de la pantalla, o que
 *   queda tras una notificación, no lo garantiza.
 *
 *   El modal tapa todo a propósito. Es la única interacción de la app que puede
 *   costarte trabajo por no mirarla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIN COLA NI TURNOS, A PROPÓSITO
 *
 *   Hay dos motorizados como mucho, así que dos solicitudes simultáneas al mismo
 *   dueño exigirían tres personas: no puede pasar. Si aun así llegaran, se
 *   APILAN —se pintan las dos, cada una con su reloj— igual que hacía el banner.
 *
 *   Una cola sería peor que apilar: la segunda solicitud correría su cuenta
 *   atrás mientras espera turno, y podría caducar sin que el dueño la haya visto
 *   nunca. Con la 0130 eso es perder un pedido en silencio.
 */
export function TransferWatcher() {
  const { receivedRequests, refresh } = useTeam()

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
    <div className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-ink/95 p-4 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[480px] flex-col justify-center gap-3 py-6 min-h-full">
        {receivedRequests.map((request) => (
          <RequestModal key={request.id} request={request} onRespond={respond} />
        ))}
      </div>
    </div>
  )
}

function RequestModal({
  request,
  onRespond,
}: {
  request: Request
  onRespond: (id: string, accept: boolean) => void
}) {
  const now = useNow()
  const { remainingSec, pct, expired } = getTransferRemaining(request, now)
  const danger = remainingSec <= 10

  // CADUCADA NO ES "SE CANCELÓ". El backend interpreta el silencio como un sí
  // (0130): el pedido se está pasando al compañero ahora mismo. Decir "solicitud
  // caducada" sugeriría lo contrario, y el pedido desaparecería de "Míos" sin
  // explicación.
  if (expired) {
    return (
      <div className="rounded-[24px] bg-warning p-6 text-white shadow-elev-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">
              Transferencia automática…
            </p>
            <p className="mt-1 text-[17px] font-semibold">
              Pasando el pedido
              {request.shortId ? ` #${request.shortId}` : ''} a {request.requesterName}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[24px] bg-card p-6 shadow-elev-4">
      {/* Reloj arriba y grande: es el dato que decide. */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
          Solicitud de traspaso
        </p>
        <span
          className={cn(
            'font-mono text-[30px] font-bold leading-none tabular-nums',
            danger ? 'text-danger' : 'text-brand-dark',
          )}
        >
          {mmss(remainingSec)}
        </span>
      </div>

      <h2 className="mt-3 font-display text-[22px] font-bold leading-tight text-ink">
        Un motorizado quiere tomar tu pedido
      </h2>

      <p className="mt-1.5 text-[15px] text-ink-muted">
        <span className="font-semibold text-ink">{request.requesterName}</span> te lo está pidiendo.
      </p>

      {/* Identificación del pedido: código para nombrarlo, y dirección para
          reconocerlo. En 30 segundos el código solo no basta. */}
      <div className="mt-4 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13px] font-semibold text-ink">
            {request.shortId ? `#${request.shortId}` : 'Pedido'}
          </span>
          {request.total != null && (
            <span className="font-display text-[17px] font-bold tabular-nums text-ink">
              {soles(request.total)}
            </span>
          )}
        </div>
        {request.businessName && (
          <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/55">
            {request.businessName}
          </p>
        )}
        {request.deliveryReference && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[14px] leading-snug text-ink-muted">
            <Icon name="location_on" size={16} className="mt-px shrink-0 text-brand" />
            <span className="line-clamp-2">{request.deliveryReference}</span>
          </p>
        )}
      </div>

      <div className="mt-4 h-2 rounded-full bg-ink/[0.08]">
        <div
          className={cn(
            'h-2 rounded-full transition-[width] duration-1000 ease-linear',
            danger ? 'bg-danger' : 'bg-brand',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* SI NO RESPONDES, SE LO LLEVAN. Dicho explícitamente: es lo que cambió
          con la 0130 y lo que la persona necesita saber para decidir. */}
      <p className="mt-2.5 text-[12px] text-ink-muted">
        Si no respondes a tiempo, el pedido pasa a {request.requesterName}.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Button className="w-full" onClick={() => onRespond(request.id, true)}>
          Sí, dáselo
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => onRespond(request.id, false)}>
          No, es mío
        </Button>
      </div>

      {/* Cerrar = rechazar explícito, no "ignorar". Con el silencio costando el
          pedido, una X que solo esconda el modal sería una trampa. */}
      <button
        type="button"
        onClick={() => onRespond(request.id, false)}
        aria-label="Cerrar y quedarme el pedido"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink/[0.04]"
      >
        <Icon name="close" size={16} />
        Cerrar
      </button>
    </div>
  )
}
