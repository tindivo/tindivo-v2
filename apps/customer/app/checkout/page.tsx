'use client'

import { BlockedView } from '@/features/checkout/components/blocked-view'
import { UnifiedCheckout } from '@/features/checkout/components/unified-checkout'
import { useCheckout } from '@/features/checkout/hooks/use-checkout'
import { useCheckoutValidation } from '@/features/checkout/hooks/use-checkout-validation'

/**
 * QUÉ SIGUE SIENDO PANTALLA COMPLETA Y QUÉ NO.
 *
 * `BlockedView` sí: con la cuenta pausada no hay pedido que hacer, así que
 * enseñar el checkout detrás sería enseñar un camino cerrado.
 *
 * El bloqueo de GPS ya NO. Es recuperable —basta salir al patio— y sustituir la
 * pantalla entera costaba el contexto de todo lo que el cliente acababa de
 * elegir. Ahora es una hoja sobre el checkout, montada junto al resto de hojas
 * en `unified-checkout`. Ver `geo-block-sheet.tsx`.
 *
 * Aquí vivía además un SEGUNDO `OtpVerificationSheet`, idéntico al que ya monta
 * `unified-checkout` y atado al mismo `showOtpSheet`: se abrían los dos, uno
 * encima del otro. Queda el de dentro, con las demás hojas.
 */
export default function CheckoutPage() {
  const checkout = useCheckout()
  const validation = useCheckoutValidation(checkout)
  const { blocked, confirmed, authReady } = checkout

  if (blocked) return <BlockedView />

  // El pedido ya existe y `placeOrder` lanzó la navegación al tracking, que es
  // donde el cliente ve el estado en vivo y puede cancelar. Esto es solo el
  // relevo hasta que la ruta nueva monta: sin él se vería por un instante el
  // checkout con el carrito ya vacío.
  if (confirmed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-3 px-6">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-ink/10 border-t-brand" />
        <p className="text-[15px] text-ink-muted">Abriendo tu pedido…</p>
      </main>
    )
  }

  if (!authReady) {
    return (
      <main className="mx-auto max-w-[768px] px-4 pt-16">
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </main>
    )
  }

  return <UnifiedCheckout checkout={checkout} validation={validation} />
}
