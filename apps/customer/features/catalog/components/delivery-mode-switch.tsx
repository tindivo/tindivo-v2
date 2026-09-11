'use client'

import type { DeliveryMethod } from '@tindivo/contracts'
import { cn, Icon } from '@tindivo/ui'

interface DeliveryModeSwitchProps {
  acceptsDelivery: boolean
  acceptsPickup: boolean
  value: DeliveryMethod
  onChange: (method: DeliveryMethod) => void
}

/**
 * Cómo quiere recibir el cliente, preguntado en la ficha del negocio.
 *
 * POR QUÉ AQUÍ Y NO SOLO EN EL CHECKOUT. La pregunta vivía en el último paso, y
 * ahí ya no sirve para lo que de verdad hace falta: ANUNCIAR. Quien no sabe que
 * el recojo existe no lo descubre pidiendo un delivery — lo descubre mientras
 * decide si pide. Es el mismo sitio donde lo ponen las apps grandes, y por la
 * misma razón: es un modo de mirar la carta, no una casilla de un formulario.
 *
 * Y hay una segunda razón, más terrena: con esto contestado antes de la bolsa,
 * el gate del carrito ya sabe que a un recojo no hay que pedirle domicilio
 * (`lib/order-gates.ts`), y el registro de quien va a recoger se queda en cuenta
 * + celular. Ese es el atajo que sostiene el sticker del mostrador.
 *
 * FILA PROPIA, Y NO DENTRO DE LA DE ESTADO. La fila de «Abierto · cierra 23:59 ·
 * Llega en 25–35 min» está en su límite: `business-identity.tsx` documenta que
 * quitar de ahí la palabra «Delivery» es justo lo que la dejó por debajo de los
 * 360 px del Android más estrecho del piloto. Meter dos botones ahí lo rompe
 * otra vez, en los teléfonos de San Jacinto.
 *
 * LAS TRES FORMAS, y ninguna es decorativa:
 *
 *   · Los dos canales → el conmutador. Hay algo que elegir.
 *   · Solo recojo → un rótulo fijo. No hay elección, pero SÍ hay noticia: sin
 *     esto el cliente supone delivery —el nombre del producto lo sugiere— y se
 *     entera al final. Decirlo aquí ahorra el viaje entero.
 *   · Solo delivery → nada. Es el supuesto por defecto de la app; un conmutador
 *     de una sola opción es ruido que además insinúa que la otra existiría.
 *
 * (El negocio de solo catálogo no llega hasta aquí: tiene su propia rama de
 * WhatsApp en `business-identity.tsx`.)
 */
export function DeliveryModeSwitch({
  acceptsDelivery,
  acceptsPickup,
  value,
  onChange,
}: DeliveryModeSwitchProps) {
  if (!acceptsPickup) return null

  if (!acceptsDelivery) {
    return (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[12.5px] text-ink-muted">
        <Icon name="store" size={15} className="shrink-0" />
        <span>
          Solo <strong className="font-semibold text-ink">recojo en el local</strong>
        </span>
      </div>
    )
  }

  return (
    /*
     * `<fieldset>` + `<legend>` y no un `div` con `role="group"`: es el elemento
     * que ya significa esto, y lo pide Biome (`a11y/useSemanticElements`).
     *
     * El rótulo se anuncia una vez para el grupo; sin él, un lector de pantalla
     * lee «Delivery, botón» sin decir nunca de qué va la elección. Va en
     * `sr-only` porque a la vista el conmutador se explica solo: dos palabras,
     * dos iconos, y encima el nombre del restaurante.
     *
     * `min-w-0` porque un `fieldset` arranca en `min-inline-size: min-content` y
     * sin eso se niega a encoger dentro de la columna estrecha.
     */
    <fieldset className="mt-3 flex min-w-0 gap-1 rounded-[14px] bg-ink/[0.05] p-1">
      <legend className="sr-only">Cómo quieres recibir tu pedido</legend>
      <ModeButton
        active={value === 'delivery'}
        onClick={() => onChange('delivery')}
        icon="local_shipping"
        label="Delivery"
      />
      <ModeButton
        active={value === 'pickup'}
        onClick={() => onChange('pickup')}
        icon="store"
        label="Recojo"
      />
    </fieldset>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // `min-h-[36px]` y no una altura fija: el objetivo táctil no puede
        // encogerse si la fuente del sistema viene grande.
        'flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-[11px] font-semibold text-[13px] transition-all',
        active
          ? 'bg-card text-ink shadow-elev-1'
          : 'text-ink-muted hover:text-ink active:bg-ink/[0.04]',
      )}
    >
      <Icon name={icon} size={16} className="shrink-0" />
      {label}
    </button>
  )
}
