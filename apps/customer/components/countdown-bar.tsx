import type { CSSProperties } from 'react'

/**
 * El plazo cuando **es** la pantalla, no un dato de acompañamiento.
 *
 * POR QUÉ EXISTE ADEMÁS DE `CountdownPill`.
 *   La píldora de `features/tracking/components/tracking-countdown.tsx` está
 *   pensada para caber en una línea junto a otra frase, y a 12 px cumple como
 *   dato secundario. Pero hay dos momentos en que el reloj es lo único que
 *   importa —los quince minutos para yapear y los diez de la revisión del
 *   comprobante— y ahí un dato secundario no es un problema de tamaño sino de
 *   jerarquía: el cliente que no encuentra el contador no sabe que tiene prisa.
 *
 * LO QUE APORTA NO ES EL NÚMERO GRANDE, ES LA BARRA.
 *   `7:20` no dice nada sin saber de cuánto se partía, y este flujo encadena
 *   tres ventanas de duraciones distintas —8 minutos para que el negocio
 *   confirme, 15 para pagar, 10 para revisar—, así que la pregunta «¿esto es
 *   mucho o poco?» se hace tres veces seguidas. La barra la responde sin leer.
 *
 * POR QUÉ VIVE EN `components/` Y NO EN LA FEATURE.
 *   Porque su primer consumidor es `prepay-proof-section.tsx`, que también vive
 *   aquí y **no debe importar de `features/tracking`**. Por eso el contador
 *   entra como tipo estructural y no como el `CountdownView` del dominio: quien
 *   llama lo adapta en la frontera, que es lo que `tracking-prepay.tsx` ya hacía
 *   antes de que esto existiera.
 */
export interface CountdownBarView {
  /** El `mm:ss` ya formateado, o el texto de plazo vencido («Procesando…»). */
  label: string
  /** Último tercio de la ventana, con tope de 3 minutos. Lo decide `deadline.ts`. */
  urgent: boolean
  /**
   * Cuánto queda de la ventana, de 1 a 0. `null` cuando el plazo ya venció: ahí
   * no hay ventana que representar, y una barra a cero durante el minuto que
   * tardan los crons en reaccionar parece la app colgada —que es justo lo que
   * el texto de plazo vencido existe para evitar.
   */
  fraction: number | null
}

/** `dark` para superficies oscuras (el hero), `light` sobre tarjetas claras. */
type Tono = 'dark' | 'light'

type Estado = 'vencido' | 'urgente' | 'normal'

const CAJA: Record<Estado, Record<Tono, string>> = {
  normal: { light: 'bg-brand-soft text-brand-dark', dark: 'bg-white/10 text-white' },
  urgente: { light: 'bg-danger-soft text-danger', dark: 'bg-white/15 text-white' },
  vencido: { light: 'bg-ink/[0.06] text-ink-muted', dark: 'bg-white/10 text-white/70' },
}

const RELLENO: Record<Estado, Record<Tono, string>> = {
  normal: { light: 'bg-brand', dark: 'bg-brand-light' },
  urgente: { light: 'bg-danger', dark: 'bg-white' },
  vencido: { light: 'bg-ink/25', dark: 'bg-white/40' },
}

const PISTA: Record<Tono, string> = { light: 'bg-ink/[0.08]', dark: 'bg-white/15' }

interface CountdownBarProps {
  view: CountdownBarView
  /**
   * La frase a la izquierda del número. La pone quien llama porque cada plazo
   * dice una cosa distinta —«Tiempo para pagar», «Revisando tu pago»— y un
   * mismo texto para los tres dejaría un cronómetro sin sujeto.
   */
  titulo: string
  tono?: Tono
}

export function CountdownBar({ view, titulo, tono = 'light' }: CountdownBarProps) {
  const vencido = view.fraction === null
  const estado: Estado = vencido ? 'vencido' : view.urgent ? 'urgente' : 'normal'

  return (
    <div className={`rounded-[16px] px-3.5 py-2.5 ${CAJA[estado][tono]}`}>
      <div className="flex items-center gap-2.5">
        {/* El latido del design system, no un `animate-pulse`: la respiración
            lenta para «atiende a esto» y la rápida —que nunca se apaga del
            todo— para lo que ya es urgente. Ver `packages/ui/src/theme.css`. */}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${RELLENO[estado][tono]} ${
            estado === 'urgente'
              ? 'animate-[t-attention-hard_900ms_ease-in-out_infinite]'
              : estado === 'normal'
                ? 'animate-[t-attention_2s_ease-in-out_infinite]'
                : ''
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{titulo}</span>
        <span
          className={`shrink-0 font-mono font-bold tabular-nums ${
            vencido ? 'text-[13px]' : 'text-[20px] leading-none'
          }`}
        >
          {view.label}
        </span>
      </div>

      {view.fraction !== null && (
        <div
          className={`mt-2 h-1.5 overflow-hidden rounded-full ${PISTA[tono]}`}
          aria-hidden="true"
        >
          {/* `duration-1000 ease-linear` y no la curva por defecto: el tick del
              contador es de un segundo exacto, así que una transición de la
              misma duración y sin aceleración hace que la barra baje continua
              en vez de dar un salto por segundo. */}
          <div
            className={`h-full w-[var(--restante)] rounded-full transition-[width] duration-1000 ease-linear ${RELLENO[estado][tono]}`}
            style={{ '--restante': `${view.fraction * 100}%` } as CSSProperties}
          />
        </div>
      )}
    </div>
  )
}
