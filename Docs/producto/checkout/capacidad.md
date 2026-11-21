---
id: checkout
nombre: Confirmar pedido
actores: [CUS]
lineas: [pedidos-restaurante]
depende_de: [bolsa, direcciones, pagos]
dinero: true
codigo:
  web: [apps/customer/features/checkout/**, apps/customer/lib/order-gates.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/**]
  ios: []
  backend: [apps/api/app/api/v1/customer/checkout/**, apps/api/app/api/v1/customer/orders/route.ts, apps/api/app/api/v1/customer/orders/attempts/**, packages/contracts/src/payment-rules.ts, packages/contracts/src/client-requests.ts]
operaciones: [getPaymentOptions, getOrderAttempt]
reglas: [customerPaymentIntents, isCustomerPaymentAllowed, pickupForcesPrepay, app_settings:prepay_threshold, app_settings:max_cash_bill, app_settings:strikes, app_settings:timers, app_settings:promo_free_delivery]
---

# Confirmar pedido

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — PILOTO, pendiente de su visto bueno

## Antes de tocar

- Es la pantalla donde el cliente revisa a dónde llega, quién recibe y cómo paga, y crea el pedido (`createOrder`). Sigue a la bolsa (capacidad `bolsa`), usa la libreta de la capacidad `direcciones` y, para el pago, la capacidad `pagos`. Exige sesión y celular verificado: eso lo define la capacidad de acceso, que aún no está en `Docs/producto/`.
- `dinero: true`: muestra subtotal, envío y total, y decide qué formas de pago ofrece. **Ninguna regla de monto vive en el cliente**: la cotización (`quoteCheckout`) y `createOrder` deciden el envío, el total, el umbral de prepago y qué opciones se apagan; la app solo las pinta. Todo cambio aquí pasa por Codex y por la revisión de Jesús (invariante 9 de `AGENTS.md`).
- El pago no se hace en esta pantalla. Con «Yape o Plin» el número aparece en el seguimiento cuando el negocio acepta (capacidad `pagos`, CUS-PAY-014); aquí solo se elige.
- Todo recojo desde la app es prepago y ya no se pregunta «¿Vas al local ahora?» (CUS-CHK-028). La regla vive en `customerPaymentIntents` y la repite `create_customer_order` (`0283`); si cambias una, cambia la otra.
- Los textos de monto («Subtotal», «Envío», «Total», el motivo del umbral, el vuelto) los revisa Jesús antes de implementar.
- Reintento seguro: cada intento lleva su `Idempotency-Key`; Android guarda los intentos en un libro propio y se aparta a propósito de la web, que regenera la clave ante cualquier 4xx (CUS-CHK-010).
- Trampa conocida: la vista de bloqueo se detecta hoy por el texto del error, no por un código (CUS-CHK-012); el servidor debe devolver un `code` y la app decidir por él.
- Trampa conocida: la regla «caso de pago sin resolver» (CUS-CHK-019) solo existe calculada en el cliente web. Decidido por Jesús el 2026-11-19 (opción A): `createOrder` devuelve un código de error con ese caso y la app solo lo muestra; no hay ninguna regla en el cliente. Ese código aún no existe en el servidor.
- El pago único del cliente de confianza (PR #112) vale mientras siga el diseño aprobado: Jesús decidió el 2026-11-19 que su servidor se construye **antes** que la app; hoy aún no existe en el repo (ver `pagos`). El confiable puede pagar con «Efectivo» o con «Yape o Plin».
- La app lee el GPS (CUS-CHK-009 y CUS-CHK-027 siguen vigentes). Las reglas de confianza son las de [`Docs/negocio/antifraude.md`](../../negocio/antifraude.md); aquí no se repiten. **Negar o no tener el GPS nunca impide pedir.**
- iOS aún no empieza: `codigo.ios` vacío. La web del cliente se apaga y no se corrige.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-CRT-008 | Antes de abrir el checkout, la app debe comprobar en orden: sesión, celular verificado y dirección válida (solo en delivery). El caso de pago sin resolver no lo calcula la app: lo informa el servidor al crear el pedido (CUS-CHK-019). | `Docs/trabajo/app-cliente/requisitos/CRT.md` · `apps/customer/lib/order-gates.ts` | ★ |
| CUS-CHK-001 | La app debe mostrar el resumen: productos con sus opciones y nota. | `Docs/trabajo/app-cliente/requisitos/CHK.md` · `apps/customer/features/checkout/components/order-detail.tsx` | |
| CUS-CHK-002 | La app debe exigir nombre y celular válidos antes de confirmar. | `CHK.md` · `packages/contracts/src/requests.ts` | ★ |
| CUS-CHK-003 | La app debe ofrecer solo el método de entrega que admite el negocio. | `CHK.md` · `CUS-CAT-016` y `CUS-CAT-017` | |
| CUS-CHK-005 | Cuando el método es delivery, la app debe permitir elegir una dirección guardada o crear una nueva, con su referencia, y una nota opcional para el motorizado de hasta 200 caracteres que no bloquea el pedido. | `CHK.md` · `DECISIONS.md §13` · `ADDRESS_REFERENCE_API_MIN` | |
| CUS-CHK-006 | La app debe ofrecer solo las formas de pago que permite la regla del contrato para ese método de entrega, sin selector «Al recibir» / «Pagar ahora». | `CHK.md` (modificado por CUS-CHK-024 y CUS-CHK-028) · `customerPaymentIntents` | ★ |
| CUS-CHK-007 | Cuando el servidor decide que el pago debe ser adelantado (total con envío sobre el umbral, faltas del cliente o recojo), la app debe forzar el prepago, apagar el efectivo y decir el motivo. | `CHK.md` · `Docs/negocio/antifraude.md` · `app_settings:prepay_threshold` · `app_settings:strikes` | ★ |
| CUS-CHK-008 | Cuando el pago es efectivo en delivery, la app debe pedir con cuánto paga y validar el billete y el vuelto contra el tope del negocio esa noche, y volver a consultarlo al confirmar. | `CHK.md` · `app_settings:max_cash_bill` · `Docs/negocio/dinero.md` | ★ |
| CUS-CHK-009 | La app debe capturar la ubicación en vivo al pedir, enviarla como evidencia del pedido y, si el cliente tiene historial y paga al recibir con una lectura dudosa, mostrar la hoja «reintentar / pagar por adelantado». En recojo el GPS no bloquea. **Si el cliente niega el permiso o no hay GPS, nunca se le impide pedir: pasa a prepago (o a llamada) según la regla 6 de `Docs/negocio/antifraude.md`.** La lectura adelantada al abrir el checkout **vale 2 minutos** (la web lee al confirmar y sin posición guardada): si al confirmar ya venció, la app lee de nuevo. En un pedido a domicilio que se paga al recibir, sin permiso o sin señal, la app abre una **hoja de bloqueo** como la de la web (`GeoBlockSheet`) con tres salidas: «Intentar de nuevo», «Cambiar a pago por adelantado» y «Pedir sin ubicación» (el pedido sale sin `gpsValidation`); «sin conexión» solo se dice tras un reintento fallido. Qué cliente puede pagar al recibir lo decide el servidor con las reglas de ese documento (bloqueado, strikes, monto sobre S/ 80, compra previa, GPS en vivo dentro de San Jacinto con llamada, y si no hay nada, prepago o llamada); la app no las copia. | `CHK.md` (modificado por CUS-CHK-028) · [`Docs/negocio/antifraude.md`](../../negocio/antifraude.md) · Decisión de Jesús, 2026-11-19 (opción B) | ★ |
| CUS-CHK-010 | La app debe crear el pedido con una clave de idempotencia por intento: la conserva si no sabe qué pasó (red, 5xx, plazo) y la cambia solo cuando el servidor confirma que no creó nada. | `CHK.md` · `Docs/planes/movil/contrato-rest.md` (`Idempotency-Key`) | ★ |
| CUS-CHK-011 | Cuando se crea el pedido, la app debe vaciar la bolsa, sonar y abrir el seguimiento reemplazando esta pantalla. | `CHK.md` | |
| CUS-CHK-012 | Cuando el servidor responde que la cuenta está bloqueada, la app debe mostrar la vista de bloqueo con el WhatsApp de soporte, decidiéndolo por el código de error y no por el texto. | `CHK.md` (defecto 3) | |
| CUS-CHK-013 | Cuando falte algo, el botón principal debe decir qué hacer y llevar al campo, en este orden: bolsa, nombre, dirección (línea, referencia, pin, zona), celular y efectivo. | `CHK.md` (modificado por CUS-CHK-028) | |
| CUS-CHK-014 | Mientras se verifica la bolsa contra la carta vigente, la app debe impedir confirmar con un mensaje. | `CHK.md` | |
| CUS-CHK-015 | Antes de pedir con prepago, la app debe explicar sus plazos: el negocio acepta, luego se paga y se sube la captura. | `CHK.md` (sin el recojo «más tarde») · `app_settings:timers` · `DECISIONS.md §8` | |
| CUS-CHK-016 | La app debe mostrar el envío gratis de un plato cuando la bolsa lo incluya; solo lo pinta, decide el servidor. | `CHK.md` | |
| CUS-CHK-017 | La app debe mostrar la promoción de envío gratis de lanzamiento cuando esté vigente. Diferido: la promoción venció el 2026-09-05 y se retoma con las promociones. | `CHK.md` · `app_settings:promo_free_delivery` | |
| CUS-CHK-018 | Cuando el método es recojo, la app no debe enviar billete, dirección, referencia, notas ni coordenadas, y sí el `pickupTiming` que el servidor exige hoy (valor por decidir, ver «Decisiones para Jesús»). | `CHK.md` (modificado por CUS-CHK-028) · `packages/contracts/src/client-requests.ts` | ★ |
| CUS-CHK-019 | Cuando el cliente tiene un caso de pago sin resolver, `createOrder` debe devolver un código de error propio y la app debe mostrarlo y llevar al cliente al caso (CUS-PAY-008); la app no aplica ninguna regla de plazo, apelación ni devolución. | `CHK.md` · capacidad `pagos` · Decisión de Jesús, 2026-11-19 (opción A) | |
| CUS-CHK-020 | La app debe mostrar los errores del servidor con un mensaje comprensible escrito por la app y decidido por el `code`, nunca el texto crudo. | `CHK.md` (defecto 3) | |
| CUS-CHK-023 | Cuando una forma de pago está en gris, la app debe decir el motivo una sola vez, con candado: «Por pedidos anteriores sin recibir» (faltas) o «Pedido mayor a S/ [umbral]» (monto). Al tocar una opción en gris, la línea del motivo vibra 150 ms. | `CHK.md` · Decisión de Jesús, 2026-11-16 | |
| CUS-CHK-024 | La app debe presentar «¿Cómo pagas?» según la confianza que decide el servidor: al cliente confiable, «Efectivo» y «Yape o Plin»; al no confiable, «Yape o Plin por adelantado». El número se ve en el seguimiento cuando el negocio acepta. | `CHK.md` · Decisión de Jesús, 2026-11-17 (decisión 1) | ★ |
| CUS-CHK-025 | La app debe rotular el pago digital «Yape o Plin», con los logos de Yape y de Plin, en el checkout, el comprobante y el seguimiento. | `CHK.md` · Decisión de Jesús, 2026-11-17 (decisión 1) | |
| CUS-CHK-026 | La app debe mostrar siempre «Subtotal», «Envío» y «Total» en el resumen; el envío se tacha si hay promoción. Los montos vienen de la cotización. | `CHK.md` · Decisión de Jesús, 2026-11-17 (decisión 13) | ★ |
| CUS-CHK-027 | Cuando el cliente no tiene historial y pasa a `validando`, la app debe decir «Te llamaremos para confirmar tu pedido» y, debajo, el número verificado, sin plazo prometido. | `CHK.md` · Decisión de Jesús, 2026-11-17 (decisión 14) | |
| CUS-CHK-028 | Cuando el método es recojo, la app debe tratar todo recojo como prepago: solo «Yape o Plin por adelantado», sin preguntar «¿Vas al local ahora?». | `CHK.md` · Decisión de Jesús, 2026-11-17 (decisión 9) · `pickupForcesPrepay` | ★ |
| CUS-ADR-011 | La app debe enviar con el pedido la calidad del punto de entrega: la precisión y la hora de confirmación del punto. Una precisión absurda nunca bloquea el pedido. | `Docs/trabajo/app-cliente/requisitos/ADR.md` · `packages/contracts/src/requests.ts` | ★ |
| CUS-ADR-012 | La app debe mostrar la tarifa de envío según el punto antes de confirmar; es solo para mostrar, decide el servidor. | `ADR.md` | ★ |
| CUS-ADR-013 | El servidor debe devolver la tarifa de envío de un punto en la cotización, para no repetir la geometría en el cliente. | `ADR.md` | |
| CUS-ADR-014 | En un recojo la app no debe pedir ni enviar dirección. | `ADR.md` · CUS-CHK-018 | |
| CUS-ADR-015 | Cuando el cliente pide con una dirección nueva, la app debe guardarla en su libreta sin bloquear el pedido y sin quitarle la predeterminada. | `ADR.md` | |

Retirados el 2026-11-17: CUS-CHK-004 (la pregunta «¿Vas al local ahora?», reemplazada por CUS-CHK-028), CUS-CHK-021 (reemplazado por CUS-CHK-024) y CUS-CHK-022 (la billetera agnóstica, reemplazada por CUS-CHK-025).

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-CHK-03 | Dado un total de S/ 27,00, billete máximo de la configuración y vuelto de la caja esa noche, cuando el cliente paga con S/ 20, entonces error «El monto debe cubrir el total (S/ 27.00).»; con un billete cuyo vuelto pasa del de la noche, error con el máximo con el que puede pagar; con S/ 50 se acepta (vuelto S/ 23,00); y al confirmar se vuelve a consultar el vuelto de la noche antes de enviar. | CUS-CHK-008 |
| CA-CHK-04 | Dado el umbral de prepago y un pedido a domicilio con total (comida más envío) de S/ 82,00, cuando abre «¿Cómo pagas?», entonces «Efectivo» aparece apagado con su motivo y, si se fuerza la petición, el servidor responde 403 «El total con envío (S/ 82.00) pasa de S/ 80, así que el pago debe ser adelantado.». | CUS-CHK-007, CUS-CHK-023 |
| CA-CHK-05 | Dado un envío que agotó el plazo de 15 s sin respuesta, cuando el cliente reintenta, entonces se reutiliza la misma `Idempotency-Key`; si el servidor ya creó el pedido, devuelve el mismo 201 con `idempotency-replayed`; si respondió 4xx, la siguiente acción usa una clave nueva. | CUS-CHK-010 |
| CA-CHK-06 | Dado un cliente con historial, pago en efectivo y una lectura de GPS dudosa, cuando confirma el pedido, entonces la app muestra la hoja «reintentar / pagar por adelantado» y no envía el pedido; dado un recojo con el GPS fallido, entonces envía el pedido con el método de validación `failed`. | CUS-CHK-009 |
| CA-CHK-07 | Dado una bolsa en modo recojo, cuando el cliente abre «¿Cómo pagas?», entonces solo ve «Yape o Plin por adelantado», la app no pregunta «¿Vas al local ahora?» y crear el pedido con un pago al recibir devuelve 422. | CUS-CHK-028, CUS-CHK-006, CUS-ADR-014 |
| CA-CHK-08 | Dado un pedido a domicilio con envío de S/ 2,50 y subtotal de S/ 31,00, entonces el resumen muestra Subtotal S/ 31.00, Envío S/ 2.50 y Total S/ 33.50. | CUS-CHK-026 |
| CA-CHK-09 | Dado un cliente con decisión `trusted`, entonces «¿Cómo pagas?» muestra «Efectivo» y «Yape o Plin» y ningún selector «Al recibir» / «Pagar ahora». | CUS-CHK-024, CUS-CHK-006 |
| CA-CHK-10 | Dado un cliente que niega el permiso de ubicación o sin GPS, cuando confirma el pedido, entonces la app abre la hoja de GPS y, con «Pedir sin ubicación», lo envía igual y sin `gpsValidation` (nunca queda bloqueado por no tener GPS) y ese cliente pasa a prepago, o a llamada según la regla 6 de `Docs/negocio/antifraude.md`; y dado un cliente con compra previa, entonces paga al recibir sin llamada aunque no haya GPS. | CUS-CHK-009 |
| CA-CHK-11 | Dado un cliente con un caso de pago sin resolver, cuando confirma el pedido, entonces `createOrder` responde con el código de error de ese caso, la app muestra su mensaje y lleva al caso, y no hay ninguna regla de plazo ni de apelación en el cliente. | CUS-CHK-019, CUS-CRT-008 |
| CA-CHK-12 | Dado un cliente con una lectura de GPS adelantada de 2 minutos o más, cuando confirma un pedido a domicilio, entonces la app descarta esa lectura y lee de nuevo (con 1 minuto y 59 segundos la reutiliza); y dado un pedido a domicilio que se paga al recibir sin permiso o sin señal, entonces se abre la hoja de GPS, no se envía nada, y cada salida hace lo suyo: «Intentar de nuevo» lee otra vez, «Cambiar a pago por adelantado» solo cambia el método, y «Pedir sin ubicación» envía el pedido sin `gpsValidation`. Pagar por adelantado y el recojo nunca abren la hoja. | CUS-CHK-009 |
| CA-CHK-P2 | Dado un cliente con decisión `risk_blocked`, cuando abre «¿Cómo pagas?», entonces solo «Yape o Plin por adelantado» se puede elegir, «Efectivo» aparece en gris con candado y el texto «Por pedidos anteriores sin recibir» aparece exactamente una vez. | CUS-CHK-023, CUS-CHK-024 |
| CA-CHK-P3 | Dado «Efectivo» elegido, entonces «Yape o Plin» se muestra en una sola fila, sin subtítulo. | CUS-CHK-024 |

Retirados: CA-CHK-01 (recojo «más tarde» solo prepago) y CA-CHK-02 (pregunta de recojo sin respuesta), por CUS-CHK-028 → CA-CHK-07; CA-CHK-P1 (selector «Al recibir» / «Pagar ahora»), por CUS-CHK-024 → CA-CHK-09.

## Reglas

- Formas de pago permitidas por método de entrega: `customerPaymentIntents` y `isCustomerPaymentAllowed`.
- Todo recojo desde la app es prepago: `pickupForcesPrepay`.
- Umbral de prepago por monto: `app_settings:prepay_threshold`; lo aplica el servidor al cotizar y al crear el pedido.
- Faltas que obligan al prepago y al bloqueo: `app_settings:strikes`; las lee el servidor. Quién puede pagar al recibir: las seis reglas de [`Docs/negocio/antifraude.md`](../../negocio/antifraude.md).
- Billete máximo del efectivo: `app_settings:max_cash_bill`; el vuelto de la noche lo devuelve la cotización.
- Plazos del prepago (aceptación, pago, revisión): `app_settings:timers`.
- Promoción de envío gratis de lanzamiento: `app_settings:promo_free_delivery`.

## Defectos

Estado en Android contrastado el 2026-11-19 contra `develop@25a6d537`. Solo lo que falta o se difiere; lo demás está hecho (el detalle con evidencia va en el cuerpo del PR).

| # | Requisito | Estado | Hallazgo | Dónde |
|---|---|---|---|---|
| 1 | CUS-CHK-028, CUS-CHK-013, CUS-CHK-018 | FALTA | Android todavía pregunta «¿Vas al local ahora?» y manda `pickupTiming` según la respuesta; el botón dice «Responde si vas ahora». | `feature/checkout/CheckoutDeliverySection.kt` · `CheckoutUiState.kt` · `CheckoutRequests.kt` |
| 2 | CUS-CHK-024, CUS-CHK-006, CUS-CHK-025 | FALTA | Las opciones se agrupan «Al recibir» / «Antes de recibir» y «Yape o Plin» al motorizado sigue existiendo; sin logos ni rediseño de «¿Cómo pagas?». | `feature/checkout/CheckoutPaymentSection.kt` · `PaymentChoice.kt` |
| 3 | CUS-CHK-023 | FALTA | Cada opción apagada repite su motivo; falta decirlo una sola vez, con candado y vibración. | `feature/checkout/CheckoutPaymentSection.kt` |
| 4 | CUS-CHK-026 | FALTA | El resumen rotula la fila «Delivery» y no «Envío». | `feature/checkout/CheckoutTotalsSection.kt` |
| 5 | CUS-CHK-009 | FALTA | No hay lectura de GPS ni hoja de bloqueo en el checkout. Decidido el 2026-11-19: se implementa (no se difiere), y negar el GPS nunca impide pedir. | `feature/checkout/` |
| 6 | CUS-CHK-027 | FALTA | No existe el texto de `validando`; la app tampoco manda GPS, así que un cliente sin historial no llega a ese estado. | `feature/checkout/` |
| 7 | CUS-CHK-011 | FALTA | La bolsa se consume y se abre el seguimiento, pero no suena. | `feature/checkout/CheckoutViewModel.kt` |
| 8 | CUS-CHK-012, CUS-CHK-020 | FALTA | El bloqueo se detecta con una expresión regular sobre el texto del error; los mensajes por código no cubren todos los códigos. | `feature/checkout/CheckoutReducers.kt` · `res/values/strings.xml` |
| 9 | CUS-CHK-014 | FALTA | Solo hay «Calculando tu pedido…»; falta «Estamos verificando tu bolsa con el menú actual.». | `res/values/strings.xml` · `feature/checkout/CheckoutUiState.kt` |
| 10 | CUS-CHK-015 | FALTA | La explicación del prepago cuenta los tres pasos pero no dice los plazos, y la app conserva el texto del recojo «más tarde» («no se devuelve»), que ya no existe. | `res/values/strings.xml` |
| 11 | CUS-CHK-019, CUS-CRT-008 | FALTA | No hay compuerta de caso de pago sin resolver; la regla solo existe en el cliente web. Decidido el 2026-11-19: `createOrder` devuelve un código de error y la app solo lo muestra; falta el código en el servidor y mostrarlo en la app. | `apps/customer/lib/payment-block.ts` |
| 12 | CUS-CHK-017 | DIFIERE | Promoción vencida; se retoma con las promociones. | `res/values/strings.xml` (`checkout_promo_launch`) |
