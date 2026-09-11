/**
 * Pub/sub módulo-level entre el efecto de Realtime (`chrome.tsx`, vía
 * `usePaymentChangeAlerts`) y el host visual (`PaymentChangeAlertHost`).
 *
 * SEPARADO DEL COMPONENTE A PROPÓSITO, y no junto al host como su gemelo
 * `notifySuccess` en `toast.tsx`: `usePaymentChangeAlerts` vive en
 * `use-audio-alert.ts`, un `.ts` sin JSX, y ese módulo lo importan tests que
 * no pasan por el pipeline de React. Manteniendo el bus en un `.ts` aparte,
 * ese import es `.ts` → `.ts` y no arrastra el `.tsx` del host a los tests.
 */
let listener: ((text: string) => void) | null = null

export function notifyPaymentChanged(text: string): void {
  listener?.(text)
}

export function setPaymentChangeListener(fn: ((text: string) => void) | null): void {
  listener = fn
}
