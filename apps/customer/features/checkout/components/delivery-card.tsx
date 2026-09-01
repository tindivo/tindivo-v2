'use client'

import type { DeliveryMethod } from '@tindivo/contracts'
import { cn, Icon } from '@tindivo/ui'
import { isLineOk } from '@/components/address-fields'
import { type Address, addressIcon } from '@/features/checkout/types'

interface DeliveryCardProps {
  businessName: string
  deliveryMethod: DeliveryMethod
  address: Address | undefined
  /** Resaltar la fila de dirección: hay una falta y el cliente ya lo intentó. */
  invalid: boolean
  /** El texto de esa falta, si toca pintarlo debajo de la fila. */
  invalidMessage: string | null
  name: string
  phone: string
  onEditAddress: () => void
  onEditName: () => void
}

/**
 * DÓNDE Y A QUIÉN SE ENTREGA — dirección, contacto y, cuando exista, la nota.
 *
 * POR QUÉ ES UNA RUTA Y NO UNA LISTA
 *   Antes eran dos secciones —«Entrega» y «Datos de contacto»— con dos títulos
 *   `h2` del mismo tamaño que «Método de pago». Tres bloques con el mismo peso
 *   visual para tres cosas de importancia muy distinta: elegir cómo pagas es
 *   una decisión, confirmar que te llamas como te llamas no lo es.
 *
 *   Aquí las dos se funden en UN objeto, y el objeto dibuja lo que de verdad va
 *   a pasar: sale del local, llega a tu puerta. El punteado entre los dos
 *   puntos es lo único que se añade, y es lo que convierte una lista de campos
 *   en un envío. Es también el patrón que el cliente ya reconoce de cualquier
 *   app de delivery, así que no hay nada que aprender.
 *
 * EL ICONO NO ES UN EMOJI
 *   La fila de dirección llevaba 🏠 o 📍 según si había dirección elegida. Un
 *   emoji dentro de un cuadrado de color no es un icono: cambia de tamaño y de
 *   estilo en cada teléfono, no toma el color de la marca, y contradice al
 *   propio DS. Ver `addressIcon` en `types.ts`.
 */
export function DeliveryCard({
  businessName,
  deliveryMethod,
  address,
  invalid,
  invalidMessage,
  name,
  phone,
  onEditAddress,
  onEditName,
}: DeliveryCardProps) {
  const pickup = deliveryMethod === 'pickup'
  // La calle puede faltar en una dirección YA GUARDADA: el directorio del v1
  // trajo filas con referencia y sin línea. Eso se avisa siempre, sin esperar a
  // que el cliente toque el botón, porque es un dato que ya está mal.
  const missingLine = Boolean(address && !isLineOk(address.line))

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] border bg-card shadow-elev-1 transition-colors',
        invalid || missingLine
          ? 'border-danger/35 ring-[3px] ring-danger/[0.07]'
          : 'border-ink/[0.04]',
      )}
    >
      <div className="px-3.5 pt-3.5">
        {/* ── Origen ── */}
        <div className="flex items-start gap-3">
          <div className="flex w-9 shrink-0 flex-col items-center">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-surface-low text-ink-muted"
            >
              <Icon name="storefront" size={16} />
            </span>
            {!pickup && (
              <span aria-hidden className="mt-1 h-5 border-ink/[0.13] border-l-2 border-dashed" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate font-semibold text-[13.5px] text-ink">
              {businessName || 'Restaurante'}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-subtle">
              {pickup ? 'Recoges tu pedido en el local' : 'El motorizado recoge aquí'}
            </div>
          </div>
        </div>

        {/* ── Destino ── */}
        {!pickup && (
          <button
            type="button"
            onClick={onEditAddress}
            className="-mx-1.5 mt-0.5 flex w-[calc(100%+12px)] items-start gap-3 rounded-[14px] px-1.5 pt-1 pb-3.5 text-left transition-colors hover:bg-ink/[0.02]"
          >
            <span className="flex w-9 shrink-0 justify-center">
              <span
                aria-hidden
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl',
                  missingLine ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-dark',
                )}
              >
                <Icon name={address ? addressIcon(address.label) : 'add_location_alt'} size={19} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              {address ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px] text-ink">{address.label}</span>
                    {missingLine && (
                      <span className="rounded-full bg-danger-soft px-1.5 py-0.5 font-bold text-[9px] text-danger uppercase tracking-[0.06em]">
                        Falta la calle
                      </span>
                    )}
                  </span>
                  {address.line ? (
                    <span className="mt-0.5 block text-[12.5px] text-ink-muted leading-snug">
                      {address.line}
                    </span>
                  ) : (
                    <span className="mt-0.5 block font-medium text-[12px] text-danger leading-snug">
                      Sin la calle y el número el motorizado no te encuentra. Toca para completarla.
                    </span>
                  )}
                  {address.reference && (
                    <span className="mt-0.5 block text-[11.5px] text-ink-subtle leading-snug">
                      {address.reference}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="block font-semibold text-[14px] text-ink">
                    Agregar dirección
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-muted leading-snug">
                    Necesitamos saber dónde entregar tu pedido.
                  </span>
                </>
              )}
            </span>
            <span aria-hidden className="mt-1.5 flex shrink-0 text-ink-subtle">
              <Icon name="chevron_right" size={20} />
            </span>
          </button>
        )}
        {pickup && <div className="h-3.5" />}
      </div>

      {/* El aviso de la falta, PEGADO a la fila que la causa. Antes vivía al
          final del scroll: tocabas el CTA, la pantalla estaba ya abajo del todo
          y el mensaje hablaba de un campo que no se veía. */}
      {invalid && invalidMessage && (
        <p className="flex items-start gap-2 border-danger/15 border-t bg-danger/[0.045] px-3.5 py-2.5 font-semibold text-[12.5px] text-danger leading-snug">
          <span aria-hidden className="mt-px flex shrink-0">
            <Icon name="error" size={15} />
          </span>
          {invalidMessage}
        </p>
      )}

      {/* ── Contacto ── */}
      <button
        type="button"
        onClick={onEditName}
        className="flex w-full items-center gap-3 border-ink/[0.04] border-t px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.02]"
      >
        <span className="flex w-9 shrink-0 justify-center">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-low text-ink-muted"
          >
            <Icon name="person" size={19} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-[14px] text-ink">
            {name || 'Agrega tu nombre'}
          </span>
          <span className="mt-0.5 block font-mono text-[12px] text-ink-subtle tabular-nums">
            {phone || 'Sin teléfono'}
          </span>
        </span>
        <span aria-hidden className="flex shrink-0 text-ink-subtle">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>
    </div>
  )
}
