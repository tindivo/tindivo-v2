'use client'

import type { PaymentIntent } from '@tindivo/contracts'
import { cn, Icon } from '@tindivo/ui'
import { useId } from 'react'
import { PAYMENT_MOMENTS, PAYMENT_OPTIONS } from '@/features/checkout/types'

interface PaymentMethodListProps {
  value: PaymentIntent
  onChange: (v: PaymentIntent) => void
  /** El pedido obliga a pagar por adelantado. */
  mustPrepay: boolean
  /** Por qué obliga. Se pinta bajo el grupo que queda apagado. */
  prepayReason: string | null
}

/**
 * CÓMO PAGA EL CLIENTE.
 *
 * SE CONSERVA la agrupación por MOMENTO —«al recibir» / «por adelantado»— que
 * ya existía, y por el mismo motivo que está escrito en `types.ts`: es la única
 * pregunta que el cliente trae a esta pantalla, y con la lista plana dos
 * opciones con el mismo par de logos se leían como la misma fila repetida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE CAMBIA · UNA OPCIÓN BLOQUEADA SE APAGA, NO SE ESCONDE
 *
 *   Antes, cuando el pedido obligaba a prepagar, la lista se FILTRABA:
 *
 *       PAYMENT_OPTIONS.filter((o) => !mustPrepay || o.value === 'prepaid')
 *
 *   y en pantalla quedaba una sola fila, con su radio ya marcado, bajo una
 *   cabecera de grupo. Una lista de un elemento con un radio no es una
 *   elección: es un adorno con forma de pregunta. Y el cliente que llegaba ahí
 *   —por definición, el de su primer pedido— no llegaba a saber que existen
 *   otras dos formas de pagar ni que las tendrá la próxima vez.
 *
 *   Apagadas, la pantalla dice tres cosas de un vistazo: existen tres opciones,
 *   hoy va por esta, y por esto. Es exactamente el patrón que ya usaban los
 *   chips de efectivo que no alcanzan el vuelto.
 *
 *   Con UNA diferencia deliberada respecto a aquellos: allí el chip SÍ hace
 *   algo al tocarlo (explicarse), así que `aria-disabled` habría mentido. Aquí
 *   la fila no hace nada —el motivo ya está escrito debajo del grupo, visible
 *   sin tocar—, así que `disabled` es la verdad y además deja el motivo atado
 *   por `aria-describedby`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RADIOS DE VERDAD
 *
 *   Eran `<button>` con un `<span>` redondo dibujado a mano: sin
 *   `role="radiogroup"`, sin `aria-checked`, sin flechas del teclado. Ahora hay
 *   un `<input type="radio">` real oculto dentro de cada `<label>`, así que la
 *   semántica y la navegación con flechas salen gratis y no hay que mantener un
 *   tabindex rotatorio a mano.
 *
 *   Los dos grupos comparten un solo `name`, y es correcto: la elección es UNA.
 *   Las cabeceras son agrupación visual, y el momento entra en el nombre
 *   accesible de cada opción para que quien no las ve también lo reciba.
 */
export function PaymentMethodList({
  value,
  onChange,
  mustPrepay,
  prepayReason,
}: PaymentMethodListProps) {
  const groupName = useId()
  const reasonId = useId()

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="sr-only">Método de pago</legend>

      {PAYMENT_MOMENTS.map((grupo) => {
        const opciones = PAYMENT_OPTIONS.filter((o) => o.momento === grupo.momento)
        if (opciones.length === 0) return null
        const bloqueado = mustPrepay && grupo.momento === 'al_recibir'

        return (
          <div key={grupo.momento} className="mt-4 first:mt-0">
            <div className="mb-2.5 flex items-center gap-2.5 px-0.5">
              <span className="font-bold text-[11px] text-ink-subtle uppercase tracking-[0.14em]">
                {grupo.titulo}
              </span>
              <span aria-hidden className="h-px flex-1 bg-ink/[0.06]" />
              {/* «En este pedido», NO «hoy no».
                  De los tres motivos por los que se bloquea el grupo, «hoy» es
                  cierto en uno solo. Con `exceedsCashCap` es directamente
                  contraproducente: al cliente le basta quitar un producto para
                  desbloquearlo AHORA, y «hoy no» le dice que vuelva mañana. Con
                  `isNewUser` tampoco —el siguiente pedido puede ser de hoy
                  mismo, que es lo que promete el propio motivo de abajo. */}
              {bloqueado && (
                <span className="font-semibold text-[10px] text-ink-subtle uppercase tracking-[0.1em]">
                  En este pedido
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              {opciones.map((opt) => {
                const sel = value === opt.value
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-center gap-3 rounded-[18px] border-[1.5px] bg-card p-3.5 transition-all',
                      bloqueado
                        ? 'cursor-not-allowed border-ink/[0.04] opacity-45'
                        : 'cursor-pointer',
                      !bloqueado && sel
                        ? 'border-brand bg-brand-soft/60 shadow-[0_2px_12px_rgba(249,115,22,0.14)]'
                        : !bloqueado && 'border-ink/[0.04] shadow-elev-1 hover:border-ink/[0.10]',
                    )}
                  >
                    <input
                      type="radio"
                      name={groupName}
                      className="sr-only"
                      checked={sel}
                      disabled={bloqueado}
                      aria-describedby={bloqueado && prepayReason ? reasonId : undefined}
                      onChange={() => onChange(opt.value)}
                    />
                    <span aria-hidden className="flex shrink-0 items-center gap-1">
                      {opt.logos.map((logo) => (
                        <img
                          key={logo}
                          src={`/pay/${logo}.svg`}
                          alt=""
                          width={opt.logos.length > 1 ? 30 : 34}
                          height={opt.logos.length > 1 ? 30 : 34}
                          className="rounded-[9px]"
                        />
                      ))}
                    </span>

                    <span className="min-w-0 flex-1">
                      {/* El momento entra en el nombre accesible, no en el
                          título visible: ahí ya lo dice la cabecera del grupo, y
                          repetirlo era lo que obligaba a leer hasta el final de
                          la línea para distinguir dos filas casi idénticas. */}
                      <span className="block font-semibold text-[15px] text-ink">
                        {opt.label}
                        <span className="sr-only">, {grupo.titulo.toLowerCase()}</span>
                      </span>
                      {/* Al marcar prepago el subtítulo ASCIENDE de descripción
                          a promesa. No se apila una línea: se sustituye. */}
                      {sel && opt.value === 'prepaid' ? (
                        <span className="mt-0.5 flex items-center gap-1 font-bold text-[12px] text-success">
                          <Icon name="check" size={14} filled />
                          No pagas nada ahora
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[12px] text-ink-muted leading-snug">
                          {opt.desc}
                        </span>
                      )}
                    </span>

                    {bloqueado ? (
                      <span aria-hidden className="flex shrink-0 text-ink-subtle">
                        <Icon name="lock" size={18} />
                      </span>
                    ) : (
                      /* El check va a la DERECHA, alineado con los chevrons del
                         resto de la pantalla: un solo raíl para todo lo que se
                         acciona. Antes iba a la izquierda y empujaba los logos
                         al centro, dejando tres columnas donde bastan dos. */
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          sel ? 'border-brand bg-brand text-white' : 'border-ink-subtle/60',
                        )}
                      >
                        {sel && <Icon name="check" size={14} weight={700} />}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            {bloqueado && prepayReason && (
              <p
                id={reasonId}
                className="mt-2.5 flex items-start gap-2 rounded-[14px] bg-warning-soft px-3 py-2.5 text-[12.5px] text-[#7c4a03] leading-snug"
              >
                <span aria-hidden className="mt-px flex shrink-0">
                  <Icon name="info" size={15} />
                </span>
                {prepayReason}
              </p>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
