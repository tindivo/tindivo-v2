'use client'

import { Button, Icon, Skeleton, ToggleSwitch } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import type { PushDevice } from '@/hooks/use-push-status'
import { usePushStatus } from '@/hooks/use-push-status'
import { avisosEncendidos, avisosVista } from '../lib/avisos-copy'
import { desde, dia, PLATAFORMA } from '../lib/avisos-equipos'
import { SectionCard } from './section-card'

/**
 * ¿ESTE EQUIPO RECIBE AVISOS? ¿SE PUEDEN APAGAR? ¿QUÉ OTROS SUENAN?
 *
 * Hasta ahora esto solo contestaba la primera, y solo sabía encender. El panel
 * no distinguía «tengo permiso» de «estoy suscrito» —dos cosas distintas, y la
 * segunda es la que hace que llegue algo—, así que un equipo sin token se veía
 * exactamente igual que uno sano. Cuando falla, falla en silencio y de noche.
 *
 * Ahora es el mismo gesto que el perfil del motorizado, y por las mismas dos
 * razones:
 *
 *   - UN INTERRUPTOR, no un botón de una sola dirección. Sin él, la única forma
 *     de callar un aparato era bloquear las notificaciones en los ajustes del
 *     navegador, que las deja en `denied` — un callejón del que no se sale
 *     desde la web. Se apagaba para una noche y quedaba roto para siempre.
 *   - LA LISTA DE EQUIPOS. El sistema no puede distinguir un celular que se usa
 *     de uno olvidado en un cajón del local: los dos aceptan las entregas y los
 *     dos parecen vivos. La persona sí lo sabe, y el aviso lleva el nombre del
 *     cliente y el monto en la vista previa.
 *
 * Vive en Configuración porque es donde se mira lo que describe AL LOCAL, y
 * porque tiene que poder consultarse en frío, sin un pedido de por medio.
 *
 * EL INTERRUPTOR SOLO HABLA DE ESTE APARATO; la lista habla de todos. Si abren
 * el panel en otro celular, ahí el interruptor dice otra cosa — y eso no es una
 * limitación, es la verdad que hay que contar.
 */
export function AvisosSection() {
  const { status, busy, enable, disable, devices, devicesLoading, loadDevices, revokeDevice } =
    usePushStatus()

  // Una sola vez al abrir. No hay polling: la lista no cambia sola, cambia
  // cuando alguien abre el panel en otro aparato, y eso no pasa mientras miras
  // esta pantalla.
  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  /** Id a la espera de confirmación: quitar un equipo no tiene deshacer. */
  const [porQuitar, setPorQuitar] = useState<string | null>(null)
  const [quitando, setQuitando] = useState(false)

  const vista = avisosVista(status)
  const encendidos = avisosEncendidos(status)

  return (
    <SectionCard title="Avisos de pedidos" icon="notifications" id="avisos">
      <div className={busy ? 'opacity-60' : ''}>
        <ToggleSwitch
          checked={encendidos}
          onChange={(next) => void (next ? enable() : disable())}
          disabled={busy || !vista.editable}
          label="Avisos en este equipo"
          description={vista.resumen}
          icon={
            <Icon
              name="notifications"
              size={22}
              filled={encendidos}
              className={encendidos ? 'text-brand' : 'text-ink-muted'}
            />
          }
        />
      </div>

      {/* El estado sano no lleva cartel: el interruptor encendido ya lo dice.
          Ver la nota de `avisosVista`. */}
      {vista.alerta && (
        <div className={`mt-3 flex items-start gap-3 rounded-xl px-4 py-3 ${vista.alerta.tono}`}>
          <Icon name={vista.alerta.icon} size={18} filled className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{vista.alerta.titulo}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{vista.alerta.detalle}</p>
          </div>
        </div>
      )}

      <div className="my-5 h-px bg-ink/[0.06]" />

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          Dónde te llegan los avisos
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Si ves un equipo que ya nadie usa, quítalo: mientras esté aquí, sigue recibiendo los
          pedidos con el nombre del cliente y el monto.
        </p>

        <div className="mt-3">
          <ListaEquipos
            devices={devices}
            loading={devicesLoading}
            porQuitar={porQuitar}
            quitando={quitando}
            onPedirConfirmacion={setPorQuitar}
            onConfirmar={async (id) => {
              setQuitando(true)
              await revokeDevice(id)
              setQuitando(false)
              setPorQuitar(null)
            }}
          />
        </div>
      </div>

      {/* Lo que el push NO puede hacer, dicho aquí para que nadie cuente con
          ello: un aviso del navegador suena UNA vez con el tono del sistema y
          no se puede repetir ni subir desde la web. El aviso que insiste es el
          del panel abierto. */}
      <p className="mt-5 text-[12px] leading-relaxed text-ink-subtle">
        El aviso del navegador suena una sola vez, con el volumen del equipo. La alarma que insiste
        hasta que atiendas es la del panel abierto.
      </p>
    </SectionCard>
  )
}

function ListaEquipos({
  devices,
  loading,
  porQuitar,
  quitando,
  onPedirConfirmacion,
  onConfirmar,
}: {
  /** `null` = todavía no se sabe (cargando o falló). Distinto de lista vacía. */
  devices: PushDevice[] | null
  loading: boolean
  porQuitar: string | null
  quitando: boolean
  onPedirConfirmacion: (id: string | null) => void
  onConfirmar: (id: string) => void | Promise<void>
}) {
  // `Date.now()` una vez por render y no por fila: si no, dos filas de la misma
  // lista podrían caer a distinto lado de un minuto y contar tiempos distintos.
  const ahora = Date.now()

  if (devices === null) {
    return loading ? (
      <Skeleton className="h-14 w-full rounded-xl" />
    ) : (
      <p className="text-[13px] text-ink-muted">No se pudo leer la lista. Vuelve a entrar.</p>
    )
  }

  if (devices.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted">
        Ninguno todavía. Enciende el interruptor de arriba para recibir avisos en este equipo.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {devices.map((d) => {
        const meta = PLATAFORMA[d.platform]
        const ultimo = desde(d.lastNotifiedAt, ahora)
        const confirmando = porQuitar === d.id
        return (
          <li
            key={d.id}
            className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-surface-low p-3"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-ink-muted">
              <Icon name={meta.icon} size={20} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">
                {meta.label}
                {d.current && (
                  <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wider text-brand">
                    Este equipo
                  </span>
                )}
              </p>
              <p className="truncate text-[12px] text-ink-muted">
                Desde el {dia(d.createdAt)}
                {ultimo ? ` · último aviso ${ultimo}` : ' · sin avisos todavía'}
              </p>
            </div>

            {/* EL EQUIPO ACTUAL NO LLEVA BOTÓN, y no es por prudencia: quitarlo
                de la base deja viva la suscripción del navegador, y el
                auto-arreglo de `PushManager` la vuelve a dar de alta en
                segundos. Sería un botón que se deshace solo. Para apagar este
                está el interruptor de arriba, que sí da de baja las dos partes. */}
            {!d.current &&
              (confirmando ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={quitando}
                    onClick={() => void onConfirmar(d.id)}
                  >
                    {quitando ? 'Quitando…' : 'Sí, quitar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={quitando}
                    onClick={() => onPedirConfirmacion(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onPedirConfirmacion(d.id)}
                  aria-label={`Quitar ${meta.label}`}
                >
                  Quitar
                </Button>
              ))}
          </li>
        )
      })}
    </ul>
  )
}
