'use client'

import { Icon } from '@tindivo/ui'
import { usePushStatus } from '@/hooks/use-push-status'
import { avisosVista } from '../lib/avisos-copy'
import { SectionCard } from './section-card'

/**
 * ¿ESTE EQUIPO RECIBE AVISOS? DICHO EN UNA LÍNEA QUE SE PUEDE MIRAR.
 *
 * Hasta ahora no había forma de saberlo. El panel no distinguía «tengo permiso»
 * de «estoy suscrito» —dos cosas distintas, y la segunda es la que hace que
 * llegue algo—, así que un equipo sin token se veía exactamente igual que uno
 * sano. Cuando falla, falla en silencio y de noche.
 *
 * Es el mismo sitio y el mismo gesto que ya tiene el motorizado en su perfil.
 * Aquí vive en Configuración porque es donde se mira lo que describe AL LOCAL,
 * y porque tiene que poder consultarse en frío, sin un pedido de por medio.
 *
 * SOLO HABLA DE ESTE APARATO. Si abren el panel en otro celular, ahí el estado
 * es otro — y eso no es una limitación, es la verdad que hay que contar.
 */
export function AvisosSection() {
  const { status, busy, enable } = usePushStatus()

  const vista = avisosVista(status)

  return (
    <SectionCard title="Avisos de pedidos" icon="notifications" id="avisos">
      <div className={`flex items-start gap-3 rounded-xl px-4 py-3 ${vista.tono}`}>
        <Icon name={vista.icon} size={18} filled className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">{vista.titulo}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{vista.detalle}</p>
        </div>
      </div>

      {vista.accion && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-[14px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
        >
          <Icon name="notifications_active" size={18} filled />
          {busy ? 'Activando…' : vista.accion}
        </button>
      )}

      {/* Lo que el push NO puede hacer, dicho aquí para que nadie cuente con
          ello: un aviso del navegador suena UNA vez con el tono del sistema y
          no se puede repetir ni subir desde la web. El aviso que insiste es el
          del panel abierto. */}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
        El aviso del navegador suena una sola vez, con el volumen del equipo. La alarma que insiste
        hasta que atiendas es la del panel abierto.
      </p>
    </SectionCard>
  )
}
