import { Icon } from '@tindivo/ui'
import { useId, useState } from 'react'
import type { PrepayTimers } from '@/features/checkout/types'

interface PrepayExplainerProps {
  timers: PrepayTimers
  /**
   * El pedido NO puede pagarse al recibir: el prepago no lo eligió el cliente,
   * se lo impusimos. Entonces el detalle arranca ABIERTO.
   */
  forzado: boolean
  /** Nombre del negocio: es a él a quien se le transfiere, no a Tindivo. */
  businessName: string
}

/**
 * Cómo funciona el pago adelantado — para quien quiera saberlo.
 *
 * QUÉ HACE Y QUÉ NO
 *   NO carga con el mensaje importante. La única frase que el cliente tiene que
 *   leer sí o sí —«No pagas nada ahora»— vive DENTRO de la opción marcada, en
 *   `unified-checkout`, y se ve sin tocar nada. Esto es el detrás: la secuencia
 *   completa, plegada.
 *
 * POR QUÉ PLEGADO — Y CUÁNDO NO
 *   Porque en el checkout la mayoría no lee: marca y manda. Una tarjeta abierta
 *   con tres iconos, tres títulos, tres pies y un recuadro verde era, para ese
 *   cliente, un muro que saltar — y para el que sí quería entender, información
 *   que igual estaba disponible un toque más allá. Cerrado, la pantalla queda en
 *   una línea; abierto, contesta entero.
 *
 *   Sigue plegado para quien ELIGE prepagar: sabe lo que eligió.
 *
 *   Pero NO para quien no eligió. Con `forzado`, el prepago se lo impusimos
 *   —primer pedido, umbral, o bloqueo— y ahí el razonamiento de arriba se da la
 *   vuelta: el cliente al que hay que explicarle cómo funciona esto es
 *   exactamente el que nunca lo ha hecho, y ese es, por definición, el del
 *   primer pedido. Dejárselo plegado es esconder la explicación de la única
 *   persona que la necesita.
 *
 *   Y sigue sin ser un abierto-la-primera-vez, que es otra cosa y peor: no
 *   depende de cuántas veces haya estado aquí, sino de si hoy tiene elección.
 *   Si la cierra, se queda cerrada — `tocado` distingue «nunca lo tocó» de
 *   «decidió cerrarlo».
 *
 * LOS MINUTOS NO ESTÁN ESCRITOS AQUÍ
 *   Entran por `timers`, que sale de `app_settings.timers` (whitelisted para
 *   lectura pública en la `0193`). Clavarlos no fallaría hoy: fallaría el día
 *   que alguien toque /admin/configuracion, que es literalmente lo que pasó con
 *   el umbral de prepago —ver `lib/prepay.ts`— y con `acceptanceMinutes` en la
 *   `0172`.
 */
export function PrepayExplainer({ timers, forzado, businessName }: PrepayExplainerProps) {
  const [tocado, setTocado] = useState(false)
  const [abiertoManual, setAbiertoManual] = useState(false)
  const abierto = tocado ? abiertoManual : forzado
  const panelId = useId()

  /*
    "8 min" a secas se lee como cuánto tarda, no como cuánto tiene el negocio
    para responder — y con "Ahí pagas" al lado pasa lo mismo al revés: parece
    un tiempo de espera, no la ventana que le queda al cliente para pagar. El
    número seguía siendo el dato correcto; lo que faltaba era la palabra que
    dice de quién es el plazo.
  */
  const pasos = [
    {
      icono: 'schedule',
      titulo: 'Confirman',
      pie: `hasta ${timers.acceptance} min`,
      fondo: 'bg-surface-low text-ink-muted',
    },
    {
      icono: 'notifications_active',
      titulo: 'Te avisamos',
      pie: 'suena tu celu',
      fondo: 'bg-success-soft text-success',
    },
    {
      icono: 'account_balance_wallet',
      titulo: 'Ahí pagas',
      pie: `tienes ${timers.payment} min`,
      fondo: 'bg-brand-soft text-brand-dark',
    },
  ]

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          setTocado(true)
          setAbiertoManual(!abierto)
        }}
        aria-expanded={abierto}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-surface-low"
      >
        <Icon name="help" size={16} className="shrink-0 text-ink-subtle" />
        <span className="flex-1 font-semibold text-[13px] text-ink-muted">
          ¿Cómo funciona el pago adelantado?
        </span>
        <Icon
          name="expand_more"
          size={18}
          className={`shrink-0 text-ink-subtle transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <div id={panelId}>
          <ol className="mt-1 grid grid-cols-3 gap-2 rounded-[16px] border border-ink/[0.04] bg-card px-3 py-4">
            {pasos.map((p) => (
              <li key={p.titulo} className="flex flex-col items-center gap-1.5 text-center">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full ${p.fondo}`}
                  aria-hidden="true"
                >
                  <Icon name={p.icono} size={21} />
                </span>
                <span className="text-[13px] font-bold leading-tight">{p.titulo}</span>
                <span className="text-[11px] text-ink-subtle">{p.pie}</span>
              </li>
            ))}
          </ol>
          {/* A QUIÉN se le paga. Tindivo no retiene fondos —el dinero va
              directo al negocio— y en un pueblo, con una marca nueva, esa es la
              objeción de verdad. No es un sello aparte: es la última línea de
              la explicación que el cliente ya estaba leyendo. */}
          <p className="mt-2 px-1 text-[11.5px] text-ink-subtle leading-relaxed">
            Le transfieres directo a {businessName || 'el restaurante'}. El número te llega en el
            seguimiento del pedido, junto al contador.
          </p>
        </div>
      )}
    </div>
  )
}
