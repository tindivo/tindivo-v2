'use client'

import { Icon, ToggleSwitch } from '@tindivo/ui'
import { useState } from 'react'
import type { AlertChannel } from '@/features/tracking/hooks/use-alert-channel'
import type { WakeLock } from '@/features/tracking/hooks/use-wake-lock'

interface TrackingAlertChannelProps {
  canal: AlertChannel
  pantalla: WakeLock
}

/**
 * POR DÓNDE TE VAMOS A AVISAR, dicho sin adornos.
 *
 * Es la pieza que faltaba para que la escalera de avisos sea honesta. La app
 * tiene tres formas de avisar y ninguna funciona siempre; hasta ahora el
 * cliente no tenía manera de saber cuál le tocaba a él, así que un pedido con
 * los avisos bloqueados se veía igual que uno con todo activado — y la
 * diferencia es si se entera o no de que el motorizado está en su puerta.
 *
 * Tres estados, y cada uno dice lo que se puede prometer:
 *
 *   · CONCEDIDO   · «aunque cierres la app». Es la verdad y tranquiliza.
 *   · SIN PREGUNTAR · «solo con esta pantalla abierta», con el botón al lado.
 *     Es la segunda oportunidad para quien descartó la hoja, y en un tono más
 *     tranquilo: aquí no interrumpe nada, está ahí si le sirve.
 *   · BLOQUEADO   · no hay botón que valga, porque el navegador ya no vuelve a
 *     preguntar. Lo único útil es decir dónde se cambia. Fingir un botón que no
 *     puede funcionar sería peor que no poner nada.
 *
 * No se pinta con el pedido terminado: prometer avisos de algo que ya pasó no
 * le sirve a nadie. Lo decide la página.
 */
export function TrackingAlertChannel({ canal, pantalla }: TrackingAlertChannelProps) {
  const [comoDesbloquear, setComoDesbloquear] = useState(false)

  // Sin API de notificaciones no hay nada que contar, y en el primer render del
  // cliente el estado todavía no se ha leído.
  if (canal.estado === 'no-soportado' && !pantalla.soportado) return null

  return (
    <div className="mt-3 flex flex-col gap-3">
      {canal.estado === 'concedido' && (
        <div className="flex items-start gap-3 rounded-[18px] border border-border bg-card p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-success-soft">
            <Icon name="check" size={17} className="text-success" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-body font-semibold leading-snug">
              Te avisamos aunque cierres la app
            </p>
            <p className="text-caption text-ink-muted leading-relaxed">
              En este celular. Puedes guardar el teléfono tranquilo.
            </p>
          </div>
        </div>
      )}

      {canal.estado === 'sin-preguntar' && (
        <div className="flex flex-col gap-3 rounded-[18px] border border-brand-light bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-warning-soft">
              <Icon name="notifications_off" size={19} className="text-warning" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-body font-semibold leading-snug">
                Solo te avisamos con esta pantalla abierta
              </p>
              <p className="text-caption text-ink-muted leading-relaxed">
                Si cierras Tindivo o bloqueas el celular, no te vas a enterar de que el motorizado
                llegó a tu puerta.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={canal.activar}
            disabled={canal.activando}
            className="h-11 rounded-[14px] border-[1.5px] border-brand bg-brand-soft font-semibold text-body-lg text-brand-dark transition-colors hover:bg-brand/[0.12] disabled:opacity-60"
          >
            {canal.activando ? 'Un momento…' : 'Activar los avisos'}
          </button>
        </div>
      )}

      {canal.estado === 'bloqueado' && (
        <div className="flex flex-col gap-2 rounded-[18px] border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-low">
              <Icon name="info" size={17} className="text-ink-muted" />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-body font-semibold leading-snug">
                Los avisos están bloqueados en este navegador
              </p>
              <p className="text-caption text-ink-muted leading-relaxed">
                Ya no podemos volver a pedírtelo desde aquí: se cambia en los ajustes del sitio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setComoDesbloquear((v) => !v)}
            aria-expanded={comoDesbloquear}
            className="self-start font-semibold text-caption text-brand-dark"
          >
            {comoDesbloquear ? 'Ocultar' : 'Ver cómo activarlos'}
          </button>
          {comoDesbloquear && (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-caption text-ink-muted leading-relaxed">
              <li>Toca el candado (o el icono de ajustes) junto a la dirección de esta página.</li>
              <li>Entra en «Permisos» y busca «Notificaciones».</li>
              <li>Cámbialo a «Permitir» y vuelve a cargar esta pantalla.</li>
            </ol>
          )}
        </div>
      )}

      {pantalla.soportado && (
        <div className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-card p-4">
          <ToggleSwitch
            checked={pantalla.activo}
            onChange={pantalla.alternar}
            label="Mantener la pantalla encendida"
            icon={<Icon name="light_mode" size={19} />}
          />
          <p className="text-caption text-ink-muted leading-relaxed">
            Deja el celular a la vista: no se apagará hasta que llegue tu pedido. Gasta algo de
            batería.
          </p>
        </div>
      )}
    </div>
  )
}
