/**
 * Perfiles de compresión por tipo de imagen del dashboard.
 *
 * Los `maxEdge` son provisionales: salen de los tamaños a los que el customer
 * pinta hoy cada imagen (thumb de 92px en `menu-item-card`, 64px en
 * `dish-result-card`), con margen para pantallas 3x y para el modal de
 * producto. Ajustar cuando tengamos el inventario completo de anchos.
 */

export type ImageProfile = 'logo' | 'banner' | 'product' | 'qr' | 'proof'

export interface ProfileSpec {
  /** Lado mayor máximo en px. Nunca se amplía una imagen que ya sea menor. */
  maxEdge: number
  /** 1 = sin pérdida (WebP lossless). */
  quality: number
  /**
   * Los códigos escaneables no toleran artefactos de compresión: un QR que se
   * lee mal en la pantalla de un cliente es un pedido que no se paga. Este
   * flag prohíbe cualquier fallback con pérdida.
   */
  lossless: boolean
}

export const PROFILES: Record<ImageProfile, ProfileSpec> = {
  logo: { maxEdge: 512, quality: 0.85, lossless: false },
  banner: { maxEdge: 1600, quality: 0.82, lossless: false },
  product: { maxEdge: 1200, quality: 0.82, lossless: false },
  // El QR se guarda sin pérdida. Se reescala igualmente porque una foto de
  // 4000px en lossless pesa varios MB sin ganar un solo píxel de legibilidad.
  qr: { maxEdge: 1400, quality: 1, lossless: true },
  // Comprobante de Yape/Plin. Más calidad y más lado que una foto de plato
  // porque esto no se mira, se LEE: la cajera comprueba el nombre, el monto y
  // la hora para validar el pago, y un dígito emborronado es una llamada. Es
  // una captura de pantalla —texto nítido sobre fondo plano—, y ahí los
  // artefactos de compresión se ven mucho más que en una fotografía.
  proof: { maxEdge: 1600, quality: 0.92, lossless: false },
}

/**
 * Encaja `width`×`height` dentro de un cuadrado de lado `maxEdge` conservando
 * la proporción. Nunca amplía: si ya cabe, devuelve las dimensiones tal cual.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}
