'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import type { GeoBlockKind } from '@/features/checkout/types'

const COPY: Record<GeoBlockKind, { title: string; body: string; retry: string }> = {
  far: {
    title: 'Estás fuera de la zona que validamos',
    body: 'Tu ubicación quedó lejos del radio que revisamos al tomar un pedido. Tu bolsa y tus datos siguen como estaban.',
    retry: 'Si te moviste hace poco, espera unos segundos y vuelve a tocar.',
  },
  unavailable: {
    title: 'No pudimos leer tu ubicación',
    body: 'Tu navegador no nos la dio. Suele ser el permiso de ubicación. Tu bolsa y tus datos siguen como estaban.',
    retry: 'Activa el permiso de ubicación de tu navegador y vuelve a tocar.',
  },
  low_accuracy: {
    title: 'Tu celular dio una ubicación imprecisa',
    body: 'No es tu culpa: pasa con señal débil o bajo techo. Tu bolsa y tus datos siguen como estaban.',
    retry: 'Sal al patio o acércate a una ventana y vuelve a tocar.',
  },
}

/**
 * EL GPS FALLÓ — Y EL CHECKOUT SIGUE DETRÁS.
 *
 * Esto era una PANTALLA COMPLETA (`GeoBlockView`) que sustituía el checkout
 * entero. Dos problemas, y el segundo es el grave:
 *
 *   1 · Se perdía el contexto. Un GPS impreciso es recuperable —basta salir al
 *       patio— y no debería costar la pantalla en la que el cliente acababa de
 *       elegirlo todo. La cuenta pausada (`BlockedView`) SÍ sigue siendo
 *       pantalla completa, y está bien: ahí de verdad no se puede seguir.
 *
 *   2 · Su botón primario decía «Pagar por adelantado» y, al tocarlo, cambiaba
 *       el método de pago Y enviaba el pedido de una vez. El cliente había
 *       elegido pagar al recibir; un fallo de GPS le cambiaba la decisión de
 *       dinero sin pedirle permiso, con un botón que además parecía decir que
 *       iba a pagar en ese instante. Ahora la fila dice lo que hace —«Cambiar a
 *       pago por adelantado»— y explica la consecuencia debajo.
 *
 * Reintentar va PRIMERO en las tres variantes: es la salida que no le cuesta
 * nada al cliente. Y con la hoja, cerrar sin elegir vuelve al checkout intacto,
 * que antes solo se podía haciendo «Volver al inicio».
 */
export function GeoBlockSheet({
  kind,
  onRetry,
  onPrepay,
  onClose,
}: {
  kind: GeoBlockKind | null
  onRetry: () => void
  onPrepay: () => void
  onClose: () => void
}) {
  if (!kind) return null
  const copy = COPY[kind]

  return (
    <BottomSheet open label={copy.title} onClose={onClose}>
      <div className="px-5 pt-5 pb-7">
        <span
          aria-hidden
          className="flex h-[52px] w-[52px] items-center justify-center rounded-[17px] bg-warning-soft text-[#b45309]"
        >
          <Icon name="location_off" size={26} />
        </span>
        <h2 className="mt-3.5 font-display font-bold text-[19px] text-ink leading-tight tracking-tight">
          {copy.title}
        </h2>
        <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">{copy.body}</p>

        <div className="mt-4 flex flex-col gap-2.5">
          <SheetOption
            icon="refresh"
            tone="brand"
            title="Intentar de nuevo"
            desc={copy.retry}
            onClick={onRetry}
          />
          <SheetOption
            icon="account_balance_wallet"
            tone="neutral"
            title="Cambiar a pago por adelantado"
            desc="Sin ubicación podemos seguir, pero el pedido pasa a pagarse cuando el local confirme. Todavía no pagas nada."
            onClick={onPrepay}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
        >
          Volver al checkout y revisar mi dirección
        </button>
      </div>
    </BottomSheet>
  )
}

function SheetOption({
  icon,
  tone,
  title,
  desc,
  onClick,
}: {
  icon: string
  tone: 'brand' | 'neutral'
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[17px] border-[1.5px] border-ink/[0.05] bg-card p-3.5 text-left shadow-elev-1 transition-all hover:border-ink/[0.12] hover:shadow-elev-2 active:scale-[0.99]"
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          tone === 'brand' ? 'bg-brand-soft text-brand-dark' : 'bg-surface-low text-ink-muted'
        }`}
      >
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[14px] text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] text-ink-muted leading-snug">{desc}</span>
      </span>
      <span aria-hidden className="flex shrink-0 text-ink-subtle">
        <Icon name="chevron_right" size={20} />
      </span>
    </button>
  )
}
