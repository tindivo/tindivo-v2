/**
 * Topes de la bolsa del cliente. Fuente única: los usan los esquemas del pedido y de la cotización, y Android los
 * copia en `feature/cart/Cart.kt` (lo comprueba el vector `fixtures/vectores/bolsa.json`).
 * Docs/producto/bolsa/capacidad.md, CUS-CRT-011.
 */
export const CART_MAX_LINES = 50
export const CART_MAX_QUANTITY = 50
export const CART_MAX_MODIFIERS = 20
export const CART_MAX_NOTE_LENGTH = 140
