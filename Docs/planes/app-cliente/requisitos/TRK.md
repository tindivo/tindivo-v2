# CUS-TRK · Seguimiento

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `orders` (seguimiento) · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-TRK-001 | La app debe mostrar el seguimiento de un pedido por su código, con o sin sesión. | Sin sesión: vista pública (`GET /public/orders/:shortId`, `get_tracking`; deja de servirse 24 h tras entregar). Con sesión y dueño: además cancelar, pagar y la nota. La propiedad se comprueba por RLS. | `app/pedido/[shortId]/page.tsx`; `use-tracking.ts:39-77` · Android: `feature/orders/OrderDetailViewModel.kt` (solo con sesión; el seguimiento público por código no se encontró) | 🟡 | ⬜ | ADAPTAR · M1 |
| CUS-TRK-002 ★ | La app debe proyectar el estado del pedido en **cuatro pasos** y mostrar el cancelado aparte. | `validando/pending_acceptance/awaiting_payment/confirmed` → **Recibido**; `preparing/waiting_driver/heading_to_restaurant/waiting_at_restaurant` → **Preparando**; `picked_up/ready_for_pickup` → **En camino**; `delivered` → **Entregado**. En **recojo** el tercero dice «Listo para recoger · Pásalo a recoger en el local». | `contracts/order-status.ts:63-85`; `tracking/lib/format.ts:18-56` · Android: `feature/orders/OrderHeadline.kt` (pasos `order_step_*`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-TRK-003 | La app debe mostrar un subtítulo y un mensaje de pie según estado y forma de pago. | Textos por estado (prepago: «Esperando confirmación de disponibilidad» / «Restaurante confirmó. Paga ahora» / «Verificando tu comprobante» / «Pago verificado»); recojo: «y pagas ahí» solo si `paymentVerifiedAt` es nulo y no es prepago. | `format.ts:263-359` · Android: `res/values/strings.xml` (`order_hero_*` y `order_hero_*_sub`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-TRK-004 ★ | La app debe mostrar el tiempo estimado como **rango**, nunca como hora exacta. | ETA = `estimated_ready_at` + trayecto ⚙ (`travelMinutes` 20-25); **recojo: sin trayecto**; no se muestra con el motorizado en la puerta ni en estados terminales; `ready_for_pickup` → «Ya está listo»; mínimo ≤ 0 → «En cualquier momento»; rango igual → «12 min». Sin base de cálculo, **no se muestra nada** (no se inventa). | `format.ts:195-256` | ⬜ | ⬜ | IGUAL · M1 |
| CUS-TRK-005 ★ | Mientras corra un plazo, la app debe mostrar una cuenta atrás con su sujeto. | Tres relojes: aceptación (desde `pendingAcceptanceAt`, ⚙ 8), pago (desde `awaitingPaymentAt`, ⚙ 15), verificación (desde `validatingAt`, ⚙ 10, **solo con comprobante**). Rojo en el **último tercio, tope 3 min**; vencido → «Confirmando…/Procesando…/Revisando…» (hasta 60 s de desfase del cron). No se muestra en `validando` de contraentrega. | `tracking/lib/deadline.ts` · Android: `feature/orders/PrepayModels.kt:50` (solo el reloj de pago) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-TRK-006 ★ | La app debe permitir cancelar solo mientras el servidor lo permita. | Efectivo/Yape al recibir: en `validando` y `pending_acceptance`; **prepago: solo en `pending_acceptance`**; tiene que coincidir con `cancel_customer_order`; requiere ser el dueño; con confirmación. Tras aceptar → «va a soporte». Éxito: `cancel_reason = customer_cancelled`. | `format.ts:377-381`; `.../cancel/route.ts`; `cancel_customer_order` · Android: `feature/orders/CancelOrderViewModel.kt` (con confirmación `order_cancel_dialog`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-TRK-007 | La app debe mostrar el nombre del motorizado, y su teléfono solo cuando llegó. | `driverPhone` viaja **solo** con `arrivedAtCustomerAt`; botón para escribirle por WhatsApp; aviso «¡El motorizado llegó a tu domicilio!». | `features/tracking/components/tracking-driver.tsx`; `get_tracking` · Android: `feature/orders/DriverContact.kt` (`order_driver_whatsapp`) | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-TRK-008 | La app debe mostrar el detalle: ítems con opciones, totales, forma de pago y, en efectivo, con cuánto paga y el vuelto. | `paysWith`, `changeToGive`. | `tracking-items.tsx`; `types.ts` · Android: `feature/orders/OrderDetailSections.kt:190-195` | ✅ | ⬜ | IGUAL · M1 |
| CUS-TRK-009 | La app debe mostrar al dueño la nota que escribió para el motorizado. | Sale de una lectura bajo RLS, **no** de la vista pública (habla de la casa de alguien). | `use-tracking.ts:14-25` · Android: `feature/orders/OrderDetailSections.kt:214` | ✅ | ⬜ | IGUAL · M1 |
| CUS-TRK-010 | Cuando el estado cambie, la app debe avisar con un mensaje, tono y sonido. | Señales: `waiting`, `awaiting_payment` («Ya puedes pagar»), `confirmed`, `preparing`, `ontheway`, `ready_for_pickup`, `arrived`, `delivered`, `cancelled`. No avisa `validando` con comprobante (lo provoca el propio cliente). El aviso depende **solo del destino**, no del origen. | `tracking/lib/alerts.ts` | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-TRK-011 | La app debe permitir silenciar o activar el sonido de los avisos. | — | `tracking-sound-toggle.tsx`; `lib/sound.ts` | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-TRK-012 | Mientras el pedido siga vivo, la app debe evitar que la pantalla se apague. | `Wake Lock` web. En nativo: mantener pantalla o **Live Activity**. | `hooks/use-wake-lock.ts` | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-TRK-013 | Cuando el pedido está vivo y el cliente es el dueño, la app debe ofrecer activar las notificaciones **una vez por pedido**. | Retardo 1,5 s; tope de **2 descartes**; con permiso ya bloqueado no se ofrece. En nativo: pedirlo en el momento de valor, con explicación previa. | `hooks/use-push-offer.ts`; `lib/push.ts:33-143` | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-TRK-014 | La app debe refrescar el estado al volver a primer plano y como respaldo cada 8 s (solo visible). | Además del tiempo real. En nativo: push + refresco al activarse. | `use-tracking.ts:48-125` · Android: `feature/orders/OrderDetailViewModel.kt` (sondeo (`PollingDelay`); el refresco al volver a primer plano no se verificó) | 🟡 | ⬜ | ADAPTAR · M1 |
| CUS-TRK-015 | Cuando el pedido esté cancelado, la app debe explicar el motivo con el texto adecuado. | Según `cancel_reason` (customer, prepay_timeout, validation/pending_acceptance_timeout, business, admin, proof_rejected_final, no_show), **si ya pagó** (`proofUrl` o `paymentVerifiedAt`) y según **método** (`no_show` de recojo ≠ de delivery). Siempre deja abierta la puerta a WhatsApp. | `tracking/lib/format.ts:80-177` · Android: `feature/orders/OrderHeadline.kt:84-92` (`CancelCopy`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-TRK-016 | La app debe permitir instalar la PWA desde el seguimiento (pasos para iPhone). | Solo tiene sentido en web. | `features/tracking/components/tracking-install.tsx`; `hooks/use-pwa-install.ts` | — | — | SOLO-WEB · W |
| CUS-TRK-017 | La app debe mostrar una *Live Activity* / notificación viva con el estado del pedido. | Ver `NAT-LIV-*`. | — | ⬜ | ⬜ | NUEVO · M2 |

**Backend hoy:** `GET /public/orders/:shortId` (`get_tracking`, sondeo cada 8 s), Realtime `postgres_changes` sobre `orders`, `POST /customer/orders/:id/cancel`, lectura directa de `orders`. **Superficie móvil propuesta:** `GET /me/orders/:id` (modelo de lectura del cliente con `steps[]`, `eta`, `deadline`, `actions[]` calculados por el servidor), canal *Broadcast* privado por pedido y push.

## Requisitos nuevos (decisiones de Jesús, noviembre de 2026)

Fuente de cada fila: la decisión que la origina. Android: verificado contra `apps/android/` el 2026-11-17; iOS aún no empieza.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-TRK-018 | Donde el seguimiento muestre la cuenta de cobro, la app debe aplicar CUS-PAY-011, CUS-PAY-012 y CUS-PAY-013. | Mismo componente de «tarjeta de pago de billetera» en Seguimiento, Comprobante y Checkout. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §12; `propuestas-patrones.md`, «Seguimiento») · Android: `feature/orders/PrepaySection.kt` | 🟡 | ⬜ | ADAPTAR · M1 |

## Criterios de aceptación ★
```
CA-TRK-01 · Cancelación                                                    (CUS-TRK-006)
  Dado un pedido en efectivo en pending_acceptance de un cliente dueño
  Entonces la app ofrece «Cancelar»
  Dado un pedido prepagado en validando (con comprobante)
  Entonces la app NO ofrece «Cancelar»
  Y el texto dice que ya está en revisión y se resuelve por soporte

CA-TRK-02 · Tercer paso del seguimiento                                    (CUS-TRK-002)
  Dado un pedido en ready_for_pickup con deliveryMethod = pickup
  Entonces el paso activo es el tercero con el texto «Listo para recoger · Pásalo a recoger en el local»
  Y el ETA muestra «Ya está listo»
  Dado un pedido en picked_up con deliveryMethod = delivery
  Entonces el paso activo dice «En camino · El motorizado va en ruta»
```
