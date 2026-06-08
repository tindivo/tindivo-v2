'use client'

// Componentes visuales compartidos (Icon, sheet, header, toggle) movidos a
// @tindivo/ui para reutilizarlos en los paneles. Se re-exportan aquí para que
// los imports existentes `@/components/ui` sigan funcionando sin cambios.
export { BottomSheet, Icon, ScreenHeader, Segmented } from '@tindivo/ui'

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '+51987654321').replace(
  /\D/g,
  '',
)

/** Enlace de soporte por WhatsApp con contexto opcional del pedido (específico del cliente). */
export function SupportLink({ orderShortId }: { orderShortId?: string }) {
  const text = orderShortId
    ? `Hola, necesito ayuda con mi pedido #${orderShortId}`
    : 'Hola, necesito ayuda con la app de Tindivo'
  const href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted"
    >
      <span aria-hidden="true">💬</span>
      ¿Algún problema? <span className="font-semibold text-[#1A8050] underline">Escríbenos</span>
    </a>
  )
}

/** Placeholder rayado para imágenes de producto (específico del cliente). */
export function ProductImage({
  label,
  hue = 14,
  size = 88,
  compact = false,
}: {
  label?: string
  hue?: number
  size?: number
  compact?: boolean
}) {
  return (
    <div
      className="t-ph-image"
      style={{ width: size, height: size, background: `oklch(0.92 0.03 ${hue})` }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: compact ? 9 : 10,
          color: `oklch(0.35 0.1 ${hue})`,
          letterSpacing: '0.05em',
          textAlign: 'center',
          padding: 6,
        }}
      >
        {compact ? '◷' : label}
      </div>
    </div>
  )
}
