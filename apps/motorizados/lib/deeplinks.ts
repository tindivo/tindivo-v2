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

export const waLink = (phone: string, shortId: string) =>
  `https://wa.me/${peDigits(phone)}?text=${encodeURIComponent(
    `Hola, soy el motorizado de tu pedido #${shortId}, estoy en camino 🛵`,
  )}`
