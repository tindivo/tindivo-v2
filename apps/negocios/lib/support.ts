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

// ── El aviso al CLIENTE de que su recojo está listo (0221) ───────────────────
//
// Lo de arriba abre WhatsApp con TINDIVO (escalar un pedido sin motorizado).
// Esto abre WhatsApp con el CLIENTE, y son dos cosas distintas aunque compartan
// el `wa.me`: cambia quién recibe, quién escribe y qué se le puede decir.
//
// POR QUÉ EXISTE, teniendo push. El push del recojo listo (0220) solo alcanza a
// quien concedió el permiso de notificaciones y conserva una suscripción viva —
// en el piloto, una minoría. WhatsApp no depende de ningún permiso: el cliente
// ya dio su número y lo verificó por OTP para poder pedir. Y es el aviso que más
// cuesta perder: la comida ya está hecha y se enfría mientras nadie viene.

/**
 * Los dígitos internacionales del teléfono del cliente, o `null` si no sirve.
 *
 * `orders.customer_phone` guarda NUEVE dígitos (`9XXXXXXXX`) en el canal web,
 * pero el manual de la cajera ha guardado E.164 en el pasado, así que se
 * aceptan las dos formas — misma tolerancia que `normalizeSupportPhone` y por
 * el mismo motivo. `null` cuando no hay número o no es un móvil peruano: la UI
 * enseña el estado alternativo en vez de abrir un chat con nadie.
 */
export function customerWhatsappDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) return `51${digits}`
  if (/^519\d{8}$/.test(digits)) return digits
  return null
}

/**
 * El mensaje que le llega al cliente. Tiene que bastarse solo: lo lee en
 * WhatsApp, de un desconocido para su agenda, probablemente en la calle.
 *
 * Dice QUIÉN escribe primero. Sin eso es un número que no conoce diciéndole que
 * vaya a algún sitio, y eso no se abre: se ignora o se bloquea.
 *
 * EL MONTO VA SOLO SI HAY ALGO QUE COBRAR. En un prepago ya está pagado, y
 * recordarle una cifra que no debe es la invitación a que la pague dos veces —
 * la misma regla que `motorizados` aplica a su tarjeta («enseñar S/45 al lado de
 * "Prepagado" es una invitación a cobrarlo por error»).
 *
 * NO PROMETE PLAZOS. «Te lo guardamos 20 minutos» sería un compromiso que nadie
 * decidió, y el reloj del mostrador no cancela nada solo: quien decide si el
 * cliente no vino es la cajera.
 */
export function pickupReadyMessage(args: {
  bizName: string
  shortId: string
  customerName: string | null
  /** Total a cobrar en el mostrador, o `null` si el pedido ya está pagado. */
  totalACobrar: number | null
}): string {
  const nombre = args.customerName?.trim().split(/\s+/)[0]
  const saludo = nombre ? `Hola ${nombre}, soy ${args.bizName}.` : `Hola, soy ${args.bizName}.`
  const lineas = [saludo, `Tu pedido #${args.shortId} ya está listo. Puedes pasar a recogerlo.`]
  if (args.totalACobrar != null && args.totalACobrar > 0) {
    lineas.push(`Son S/ ${args.totalACobrar.toFixed(2)}, los pagas aquí al recogerlo.`)
  }
  return lineas.join('\n')
}
