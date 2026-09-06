'use client'

/**
 * Cuántas veces se le puede ofrecer instalar antes de callarse para siempre.
 *
 * Mismo número y mismo motivo que el permiso de avisos (`lib/push.ts`): quien
 * dijo que no dos veces ya contestó. La diferencia es que aquí no hay nada
 * irreversible que gastar —el navegador sigue ofreciendo «Instalar» en su menú—
 * así que el tope existe solo por respeto, no por daño.
 */
const MAX_OFRECIMIENTOS = 2

const CLAVE = 'tindivo:pwa:descartes'

interface Descartes {
  veces: number
  /** `shortId` del pedido en el que descartó. Ver `sePuedeOfrecerInstalacion`. */
  ultimoPedido: string
}

function leer(): Descartes {
  try {
    const crudo = window.localStorage.getItem(CLAVE)
    if (!crudo) return { veces: 0, ultimoPedido: '' }
    const v = JSON.parse(crudo) as Partial<Descartes>
    return {
      veces: Number.isFinite(v.veces) ? Number(v.veces) : 0,
      ultimoPedido: typeof v.ultimoPedido === 'string' ? v.ultimoPedido : '',
    }
  } catch {
    return { veces: 0, ultimoPedido: '' }
  }
}

/**
 * ¿Toca ofrecer instalar por el pedido `shortId`?
 *
 * Una vez por pedido: la tarjeta vive en el seguimiento de un pedido entregado,
 * y esa pantalla se vuelve a abrir —desde el historial, desde el enlace— sin
 * que eso signifique que el cliente cambió de opinión.
 */
export function sePuedeOfrecerInstalacion(shortId: string): boolean {
  const d = leer()
  if (d.veces >= MAX_OFRECIMIENTOS) return false
  return d.ultimoPedido !== shortId
}

/** Anota el descarte. Nunca lanza. */
export function descartarInstalacion(shortId: string): void {
  try {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify({ veces: leer().veces + 1, ultimoPedido: shortId } satisfies Descartes),
    )
  } catch {
    // Sin memoria se volverá a ofrecer en el próximo pedido entregado.
  }
}
