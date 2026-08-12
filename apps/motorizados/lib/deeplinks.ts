/** Deep links nativos del flujo del motorizado (Maps / teléfono / WhatsApp). */

const peDigits = (phone: string) => {
  const d = phone.replace(/\D/g, '')
  return d.length === 9 ? `51${d}` : d
}

export const mapsDirToCoords = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

export const mapsSearchAddress = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

export const telLink = (phone: string) => `tel:+${peDigits(phone)}`

/**
 * ¿Sirve este número para abrir WhatsApp?
 *
 * Vive aparte porque la pregunta se hace SIN querer mandar nada: la pantalla
 * decide si pinta el botón, y antes lo averiguaba pidiéndole a `waLink` un
 * enlace con un texto de relleno solo para mirar si salía `null`. Preguntar por
 * el número es una cosa y armar el enlace es otra; ahora se hacen por separado.
 *
 * Acepta los dos formatos que llegan de la base: 9 dígitos (`987654321`, lo que
 * teclea la cajera) y 11 con el prefijo de país (`51987654321`). Cualquier otra
 * longitud es un dato roto, y con `< 9` se colaban: un número de 10 dígitos
 * pasaba el filtro y producía un `wa.me` que no abre ninguna conversación.
 */
export function isValidPePhone(phone: string | null | undefined): phone is string {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  return digits.length === 9 || (digits.length === 11 && digits.startsWith('51'))
}

export function waLink(phone: string, text: string): string | null {
  if (!isValidPePhone(phone)) return null
  return `https://wa.me/${peDigits(phone)}?text=${encodeURIComponent(text)}`
}
