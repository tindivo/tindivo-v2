'use client'

// Componentes visuales compartidos (Icon, sheet, header, toggle) movidos a
// @tindivo/ui para reutilizarlos en los paneles. Se re-exportan aquí para que
// los imports existentes `@/components/ui` sigan funcionando sin cambios.
export { BottomSheet, Icon, ScreenHeader, Segmented, Skeleton } from '@tindivo/ui'

import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { useEffect, useState } from 'react'
import { getSupportWhatsapp } from '@/lib/support'

/** Enlace de soporte por WhatsApp con contexto opcional del pedido (específico del cliente). */
export function SupportLink({ orderShortId }: { orderShortId?: string }) {
  const [wa, setWa] = useState(TINDIVO_SUPPORT_WHATSAPP)

  useEffect(() => {
    getSupportWhatsapp().then(setWa)
  }, [])

  const text = orderShortId
    ? `Hola, necesito ayuda con mi pedido #${orderShortId}`
    : 'Hola, necesito ayuda con la app de Tindivo'
  const href = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted"
    >
      <span aria-hidden="true">💬</span>
      ¿Algún problema? <span className="font-semibold text-success underline">Escríbenos</span>
    </a>
  )
}

/**
 * Imagen de producto. Si hay `src` (foto subida por el negocio) la renderiza
 * cubriendo el recuadro; si no, cae al placeholder rayado derivado del `hue`.
 */
export function ProductImage({
  label,
  hue = 14,
  size = 88,
  src,
}: {
  label?: string
  hue?: number
  size?: number
  src?: string | null
}) {
  return (
    <div
      className="t-ph-image"
      style={{
        width: size,
        height: size,
        background: `oklch(0.92 0.03 ${hue})`,
        overflow: 'hidden',
      }}
    >
      {src ? (
        <img
          src={src}
          alt={label ?? ''}
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-geist), monospace',
            fontSize: 10,
            color: `oklch(0.35 0.1 ${hue})`,
            letterSpacing: '0.05em',
            textAlign: 'center',
            padding: 6,
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}
