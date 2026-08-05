'use client'

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
