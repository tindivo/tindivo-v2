import { Icon } from '@tindivo/ui'
import type { CountdownView } from '@/features/tracking/lib/deadline'

interface CountdownPillProps {
  view: CountdownView
  /** `dark` para el hero (fondo `bg-ink`), `light` sobre tarjetas claras. */
  tono?: 'dark' | 'light'
}

/**
 * El contador, en `mm:ss` y con cifras de ancho fijo (`tabular-nums`): sin eso
 * el número baila a cada segundo y arrastra el texto de al lado.
 */
export function CountdownPill({ view, tono = 'light' }: CountdownPillProps) {
  const vencido = view.kind === 'grace'
  const urgente = view.kind === 'running' && view.urgent

  const colores = vencido
    ? tono === 'dark'
      ? 'bg-white/10 text-white/70'
      : 'bg-ink/[0.06] text-ink-muted'
    : urgente
      ? 'bg-danger/10 text-danger'
      : tono === 'dark'
        ? 'bg-white/15 text-white'
        : 'bg-ink/[0.06] text-ink'

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[12px] font-bold tabular-nums ${colores}`}
    >
      {!vencido && <Icon name="schedule" size={13} />}
      {view.label}
    </span>
  )
}
