import type { CartLine } from '@/lib/cart'

const soles = (n: number) => `S/ ${n.toFixed(2)}`

/** Dígitos en formato internacional peruano (51 + 9 dígitos) para wa.me / tel:. */
function peDigits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length === 9 ? `51${d}` : d
}

/**
 * Mensaje de pedido para WhatsApp a partir de la bolsa (modo catálogo).
 * `unitPrice` ya incluye modificadores; `*…*` es negrita en WhatsApp.
 */
export function buildCartWhatsAppMessage(
  businessName: string,
  lines: CartLine[],
  subtotal: number,
): string {
  const items = lines
    .map((line) => {
      const parts = [`${line.quantity}× ${line.name} — ${soles(line.unitPrice * line.quantity)}`]
      for (const m of line.modifiers) parts.push(`   • ${m.groupName}: ${m.optionName}`)
      if (line.note) parts.push(`   Nota: ${line.note}`)
      return parts.join('\n')
    })
    .join('\n')

  return [
    `Hola ${businessName} 👋 Quiero hacer este pedido:`,
    '',
    items,
    '',
    `*Total: ${soles(subtotal)}*`,
    '',
    'Pedido armado en el catálogo de Tindivo 🛍️',
  ].join('\n')
}

/** Deep-link de WhatsApp con el mensaje ya URL-encodeado (una sola vez).
 *  api.whatsapp.com directo (no wa.me): el redirect de wa.me corrompe los
 *  emojis de 4 bytes (👋 → �) al regenerar el query string — verificado. */
export function waOrderLink(whatsappNumber: string, message: string): string {
  return `https://api.whatsapp.com/send/?phone=${peDigits(whatsappNumber)}&text=${encodeURIComponent(message)}`
}

export function telLink(phone: string): string {
  return `tel:+${peDigits(phone)}`
}
