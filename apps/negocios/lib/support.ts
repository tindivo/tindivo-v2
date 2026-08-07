/**
 * El número de soporte de Tindivo, para el escalamiento del tablero.
 *
 * La tarjeta y el detalle deciden lo mismo con estas funciones. Antes cada uno
 * tenía su criterio: el detalle caía a un número hardcodeado si `app_settings`
 * venía vacío, así que "sin número configurado" abría WhatsApp igual y nadie se
 * enteraba de que la configuración estaba rota. Aquí no hay fallback: si el
 * número no sirve, `normalizeSupportPhone` devuelve `null` y la UI enseña el
 * estado alternativo (patrón de prod, `urgent-call-card.tsx`).
 */

/**
 * Dígitos en formato internacional (`51 9XXXXXXXX`), o `null` si el valor
 * configurado no es un móvil peruano usable.
 *
 * Acepta las dos formas en que puede venir `app_settings.support_whatsapp`:
 * con prefijo de país (11 dígitos) o sin él (9 dígitos, empezando en 9).
 * Prod validaba solo la forma corta porque su columna guardaba el número local;
 * aquí la clave guarda el internacional, así que hay que admitir ambas.
 */
export function normalizeSupportPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) return `51${digits}`
  if (/^519\d{8}$/.test(digits)) return digits
  return null
}

/** `51906550166` → `906 550 166`. Para leerlo de un vistazo en el botón. */
export function formatSupportPhone(intlDigits: string): string {
  const local = intlDigits.slice(2)
  if (local.length !== 9) return intlDigits
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}

/**
 * El mensaje que le llega a Tindivo. Tiene que bastarse solo: quien lo recibe
 * está en WhatsApp, no en el panel, y necesita saber qué negocio escribe, qué
 * pedido es y a dónde va sin abrir nada.
 */
export function urgentDriverMessage(args: {
  bizName: string
  shortId: string
  minutesWaiting: number | null
  addressRef: string | null
}): string {
  const espera =
    args.minutesWaiting == null ? 'lleva rato listo' : `lleva ${args.minutesWaiting} min listo`
  const lineas = [
    `Hola Tindivo, soy ${args.bizName}.`,
    `El pedido #${args.shortId} ${espera} y ningún motorizado lo ha tomado.`,
  ]
  if (args.addressRef) lineas.push(`Entrega: ${args.addressRef}`)
  lineas.push('¿Pueden coordinar uno?')
  return lineas.join('\n')
}

export function supportWhatsappUrl(intlDigits: string, text: string): string {
  return `https://wa.me/${intlDigits}?text=${encodeURIComponent(text)}`
}
