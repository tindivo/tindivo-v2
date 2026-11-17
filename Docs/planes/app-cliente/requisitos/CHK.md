# CUS-CHK · Confirmar pedido

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `checkout` · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-CHK-001 | La app debe mostrar el resumen: ítems (con opciones y nota), subtotal, envío y total. | Total = subtotal + envío. Envío tachado si aplica una promo. | `features/checkout/components/order-detail.tsx`; `use-checkout-state.ts` · Android: `feature/checkout/CheckoutTotalsSection.kt` (envío tachado con promo) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-002 ★ | La app debe exigir nombre y celular válidos. | Nombre 1-120; celular `^9\d{8}$` tras normalizar. | `use-checkout-validation.ts:83-144`; `contracts/requests.ts:50-51` · Android: `res/values/strings.xml` (`checkout_cta_name`, `checkout_cta_phone`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-003 | La app debe ofrecer el método de entrega que admite el negocio. | Ver `CUS-CAT-016/017`. | `use-checkout-state.ts:174-195` · Android: `feature/checkout/CheckoutRequests.kt:38` | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-004 ★ | **Retirado, reemplazado por CUS-CHK-028: ya no se pregunta «¿Vas al local ahora?»** (Decisión de Jesús, 2026-11-17). Cuando el método sea recojo, la app debe preguntar «¿Vas al local ahora?» sin preseleccionar respuesta. | **Ahora**: cliente en el mostrador; la cajera lo verifica al aceptar; no pasa por `validando`; el GPS **no bloquea**. **Más tarde**: solo prepago. Es una **pregunta**, no una inferencia (un QR se comparte). | `contracts/requests.ts:90-127`; `use-checkout-validation.ts:92-98` · Android: `feature/checkout/CheckoutRequests.kt:74` (`pickupTiming`; ojo con la contradicción 6) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-005 | La app debe permitir elegir una dirección guardada o marcar una nueva, con referencia y nota al motorizado. | Referencia ≥ 5; **nota ≤ 200** caracteres, opcional, solo delivery, no bloquea. | `features/checkout/components/delivery-card.tsx`; `types.ts:41` · Android: `feature/checkout/CheckoutDeliverySection.kt` (nota y referencia) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-006 ★ | **Modificado por CUS-CHK-024 y CUS-CHK-028: sin selector «Al recibir» / «Pagar ahora»; todo recojo es prepago** (Decisión de Jesús, 2026-11-17). La app debe ofrecer solo las formas de pago que la matriz permite. | **Delivery:** efectivo, Yape/Plin al recibir, prepago. **Recojo «ahora»:** caja (efectivo o Yape/Plin), prepago. **Recojo «más tarde»:** solo prepago. «Yape al recibir» **no existe** en recojo (se oculta, no se apaga). En «más tarde» la caja se **apaga** con su motivo. El servidor la repite (CHECK `orders_pickup_payment_chk`). | `contracts/payment-rules.ts`; `features/checkout/types.ts:285-293` · Android: `feature/checkout/CheckoutPaymentSection.kt` (las opciones vienen de la cotización; en recojo solo prepago (contradicción 6)) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-007 ★ | **Modificado por CUS-CHK-028 y CUS-CHK-027: el recojo «más tarde» ya no existe (todo recojo es prepago)** (Decisión de Jesús, 2026-11-17). La app debe forzar prepago y explicar el motivo cuando corresponda. | Total con envío **> ⚙ `prepay_threshold` (80)**; o riesgo (**2 strikes**, `contraentrega_blocked`, `risk_blocked`); o recojo «más tarde»; o cliente sin historial sin GPS en cobertura. Un cliente sin `compra_previa` con GPS dentro de cobertura pasa a **`validando`** (llamada de la cajera). El servidor decide con `customer_contraentrega_decision`: `trusted / no_history / risk_blocked`. | `customer/orders/route.ts:60-176`; `SYS-transversal.md` · Android: `feature/checkout/CheckoutPaymentSection.kt:119-121` (`exceeds_threshold` y `prepay_required`; `validando` no se encontró) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CHK-008 ★ | Cuando el pago sea efectivo en delivery, la app debe pedir con cuánto paga y validar el vuelto. | Opciones **Exacto / S/ 20 / S/ 50 / S/ 100 / otro**; monto libre redondeado a múltiplos de **S/ 0,50**; debe **cubrir el total**; máx. billete ⚙ `max_cash_bill` (100); vuelto ≤ ⚙ vuelto de la caja **esa noche** (`effective_max_change`; 50 por defecto; 0 → «Esta noche el negocio no tiene vuelto»). El tope se **vuelve a consultar al confirmar**. En recojo no se pregunta ni se envía. | `features/checkout/lib/cash.ts`; `use-checkout-actions.ts:198-212` · Android: `feature/checkout/CashRules.kt` | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-009 ★ | **Modificado por CUS-CHK-028: «recojo ahora» ya no existe; en recojo el GPS no bloquea** (Decisión de Jesús, 2026-11-17). La app debe capturar un GPS en vivo al pedir y aplicar las reglas antifraude. | La lectura **arranca al abrir el checkout**; método `gps_high_accuracy` (precisión ≤ ⚙ 500 m) o `gps_low_accuracy`; distancia al centro; si el cliente **tiene historial**, el pago **no es prepago** y (precisión mala **o** distancia > ⚙ `warningRadiusKm` 30) → hoja de bloqueo (*reintentar / pagar por adelantado*). Sin GPS: prepago pasa con `manual_skip_prepaid`; efectivo → bloqueo `unavailable`. **Recojo «ahora» nunca bloquea** (`failed` como evidencia). | `use-checkout-actions.ts:91-175`; `use-checkout-state.ts:267-311` · Android: `feature/checkout/` (no se encontró lectura de GPS ni `gpsValidation` en el checkout) | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-CHK-010 ★ | La app debe crear el pedido con una clave de idempotencia por intento. | `POST /customer/orders` con `Idempotency-Key` (UUID). Tras un **4xx** se regenera (el servidor no creó nada); tras **fallo de red/5xx/plazo** se **conserva** (resultado desconocido); plazo 15 s. Ver `DAT-01` (el cliente hoy regenera también ante el 409 «en proceso»). | `use-checkout-actions.ts:77-89,322-386`; `packages/api-client/src/index.ts:58` · Android: `feature/checkout/OrderAttemptLedger.kt` (clave por intento, conflicto y reconciliación `checkout_reconcile_*`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-011 | Cuando se crea el pedido, la app debe vaciar la bolsa, sonar y abrir el seguimiento **reemplazando** la pantalla. | El seguimiento trae el botón de cancelar; no hay pantalla intermedia. | `use-checkout-actions.ts:25-46,330-334` | 📝 | ⬜ | ADAPTAR · M1 |
| CUS-CHK-012 | Cuando el servidor responda que la cuenta está bloqueada, la app debe mostrar la vista de bloqueo con soporte. | Hoy se detecta con `/bloquead/i` sobre el texto del error (frágil: `DAT-02`). El bloqueo total dura ⚙ 30 días (`blocked_until`). | `use-checkout-actions.ts:357,374`; `features/checkout/components/blocked-view.tsx` · Android: `res/values/strings.xml` (`checkout_blocked_*`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-013 | **Modificado por CUS-CHK-028: sale la «pregunta de recojo» del orden** (Decisión de Jesús, 2026-11-17). Cuando falte algo, el botón principal debe decir qué hacer y llevar al campo. | Orden: bolsa → nombre → pregunta de recojo → dirección (línea, referencia, pin, zona) → celular → efectivo. | `use-checkout-validation.ts:74-173` · Android: `res/values/strings.xml` (`checkout_cta_*`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-014 | Mientras se verifica la bolsa contra el catálogo, la app debe impedir confirmar con un mensaje. | «Estamos verificando tu bolsa con el menú actual.» | `use-checkout-validation.ts:175-191` · Android: `res/values/strings.xml` (`checkout_cta_calculating`; el texto de «verificando tu bolsa» no se encontró) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CHK-015 | **Modificado por CUS-CHK-028: sale el recojo «más tarde» (su destino sin devolución queda abierto en decisiones-abiertas.md, punto W)** (Decisión de Jesús, 2026-11-17). Antes de pedir, la app debe explicar los plazos y la política del prepago y del recojo «más tarde». | Aceptación ⚙ 8 min, pago ⚙ 15 min; recojo «más tarde»: se guarda hasta el cierre y **no se devuelve** (Tindivo no retiene fondos). | `features/checkout/components/prepay-explainer.tsx`; `types.ts:22`; `DECISIONS.md §8` · Android: `res/values/strings.xml` (`checkout_prepay_how`, `checkout_pickup_later_hint`) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CHK-016 | La app debe mostrar el envío gratis de un plato cuando la bolsa lo incluya. | `cart_item_free_delivery` (0227-0230); solo pinta, decide el servidor; el estado falla a «sin promo». | `use-checkout-state.ts:313-345` · Android: `feature/checkout/CheckoutTotalsSection.kt:44` (`checkout_promo_dish`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-017 | La app debe mostrar la promo de envío gratis de lanzamiento cuando esté vigente. | `current_customer_promo_free_delivery` → `active/exhausted/already_redeemed/outside_window/inactive`; **vencida el 2026-09-05** aunque `active: true`. Reutilizable como cupón. | `features/checkout/types.ts:74-114`; `app_settings.promo_free_delivery` · Android: `res/values/strings.xml` (existe `checkout_promo_launch`; la promo venció) | 🟡 | ⬜ | DIFERIR · M2 |
| CUS-CHK-018 ★ | **Modificado por CUS-CHK-028: la app deja de preguntar; el valor de `pickupTiming` que envía se define con el contrato REST v1 sin romper clientes instalados (por verificar)** (Decisión de Jesús, 2026-11-17). En un recojo, la app no debe enviar billete, dirección, referencia, notas ni coordenadas, y **sí** `pickupTiming`. | `pickupTiming` obligatorio en recojo y prohibido en delivery (422 legible). | `use-checkout-actions.ts:255-320`; `contracts/requests.ts:115-127` · Android: `feature/checkout/CheckoutRequests.kt:58-74` | ✅ | ⬜ | IGUAL · M1 |
| CUS-CHK-019 | Cuando el cliente tenga un caso de pago sin resolver, la app debe impedir el checkout y llevar al caso. | Ver `CUS-PAY-008`. | `components/gates/payment-resolution-gate-modal.tsx` | ⬜ | ⬜ | IGUAL · M1 |
| CUS-CHK-020 | La app debe mostrar los errores del servidor con un mensaje comprensible. | Hoy se muestra `problem.detail` tal cual (frases en español); con `DAT-02` se decidirá por `code` y se formateará con cadenas propias. | `use-checkout-actions.ts:361-384` · Android: `res/values/strings.xml` (`checkout_msg_*` por código; falta cubrir todos) | 🟡 | ⬜ | ADAPTAR · M1 |

**Backend hoy:** `POST /customer/orders` (393 líneas; ver `PER-03`); directo: `customer_profiles`, `customer_addresses`, `app_settings`, RPC `current_customer_trusted_for_contraentrega`, `current_customer_promo_free_delivery`, `cart_item_free_delivery`, `effective_max_change`. **Superficie móvil propuesta:** `GET /me/checkout-context?businessId=` (perfil, direcciones, decisión de contraentrega, promos, vuelto de la noche, plazos, tarifas) y `POST /orders` (idempotente).

## Requisitos nuevos (decisiones de Jesús, noviembre de 2026)

Fuente de cada fila: la decisión que la origina. Android: verificado contra `apps/android/` el 2026-11-17; iOS aún no empieza.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-CHK-021 | **Reemplazado por CUS-CHK-024** (Decisión de Jesús, 2026-11-17). La app debe presentar «¿Cómo pagas?» según la confianza que decide el servidor: al cliente confiable, «Efectivo» y «Billetera digital» (con «Al recibir» por defecto y «Pagar ahora» opcional cuando el negocio acepta prepago); al no confiable, solo «Billetera digital por adelantado», con lo demás en gris. | La decisión viene de la cotización (`trusted / no_history / risk_blocked`), nunca de la app. No confiable: faltas (≥ ⚙ `strikes.prepaymentOnlyThreshold`) o total con envío > ⚙ `prepay_threshold`. La opción elegida se expande y las demás quedan en una línea. Forma exacta: `pantallas/CHK-confirmar-pedido.md` (piloto aprobado). | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-terminos-v3/decisiones-jesus-ronda2.md`, «Cambio de Jesús, noche»; `tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §11 y §10.7) · Android: `feature/checkout/CheckoutPaymentSection.kt` pinta las opciones de la cotización con motivo; el rediseño v3 no está hecho | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CHK-022 | **Reemplazado por CUS-CHK-025: revierte la billetera agnóstica** (Decisión de Jesús, 2026-11-17). La app debe presentar el pago digital como «Billetera digital», con un ícono genérico, sin logos ni nombres de Yape o Plin en la opción. | Vale cualquier billetera que transfiera al número del negocio. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §12) · Android: hoy «Yape o Plin» (`checkout_pay_yape`, `checkout_pay_prepaid`) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-CHK-023 | Cuando una forma de pago esté en gris, la app debe decir el motivo una sola vez. | Candado en las opciones apagadas. Motivos: «Por pedidos anteriores sin recibir» (riesgo) o «Pedido mayor a S/ [⚙ `prepay_threshold`]» (monto). Si se toca una opción en gris, la línea del motivo vibra 150 ms. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-terminos-v3/decisiones-jesus-ronda2.md`; `pantallas/CHK-confirmar-pedido.md`, CA-CHK-P2) · Android: un motivo por cada opción apagada (`checkout_pay_reason_*`); una sola vez ⬜ | 🟡 | ⬜ | IGUAL · M1 |

## Criterios de aceptación ★
```
CA-CHK-01 · [RETIRADO, decisión de Jesús 2026-11-17; ver CA-CHK-07] Recojo «más tarde» solo admite prepago   (CUS-CHK-004, 006)
  Dado un negocio con accepts_web_pickup = true
  Y una bolsa en modo recojo
  Y el cliente respondió «No, paso más tarde»
  Cuando abre las formas de pago
  Entonces «Yape o Plin (antes de recibir)» está habilitada
  Y «Pagas en el local» aparece apagada con su motivo
  Y «Yape o Plin al recibir» no aparece
  Y crear el pedido con paymentIntent = pending_cash devuelve 422

CA-CHK-02 · [RETIRADO, decisión de Jesús 2026-11-17] Recojo «ahora» sin respuesta no permite continuar   (CUS-CHK-004)
  Dado una bolsa en modo recojo sin respuesta a «¿Vas al local ahora?»
  Cuando el cliente toca el botón principal
  Entonces el botón dice «Responde si vas ahora»
  Y el foco va a la pregunta
  Y no se envía ninguna petición

CA-CHK-03 · Efectivo: el billete debe cubrir el total y respetar el vuelto de la noche   (CUS-CHK-008)
  Dado un total de S/ 27,00, billete máximo ⚙ 100 y vuelto de la caja ⚙ 50
  Cuando el cliente paga con S/ 20     Entonces error «El monto debe cubrir el total (S/ 27.00).»
  Cuando el cliente paga con S/ 100    Entonces error «…el vuelto sería S/ 73.00, y esta noche hay hasta S/ 50.00. Paga con S/ 77.00 o menos…»
  Cuando el cliente paga con S/ 50     Entonces se acepta (vuelto S/ 23,00)
  Y al confirmar se vuelve a consultar el vuelto de la noche antes de enviar

CA-CHK-04 · Prepago obligatorio por umbral                               (CUS-CHK-007)
  Dado ⚙ prepay_threshold = 80 y un pedido a domicilio con total (comida + envío) S/ 82,00
  Cuando el cliente elige efectivo o «Yape al recibir»
  Entonces el servidor responde 403 «El total con envío (S/ 82.00) pasa de S/ 80, así que el pago debe ser adelantado.»
  Y la app ya no ofrecía esas opciones habilitadas (las apagó con su motivo)

CA-CHK-05 · Reintento seguro de la creación                              (CUS-CHK-010)
  Dado un envío que agotó el plazo de 15 s sin respuesta
  Cuando el cliente reintenta
  Entonces se reutiliza la misma Idempotency-Key
  Y si el servidor ya lo creó devuelve el mismo 201 con la cabecera idempotency-replayed = true
  Y si el servidor responde 4xx, la siguiente acción usa una clave nueva

CA-CHK-06 · GPS antifraude                                                (CUS-CHK-009)
  Dado un cliente con historial, pago en efectivo y precisión de GPS > ⚙ 500 m
  Cuando confirma el pedido
  Entonces la app muestra la hoja «reintentar / pagar por adelantado» y no envía el pedido
  Dado un recojo «ahora» con GPS fallido
  Cuando confirma el pedido
  Entonces la app envía el pedido con gpsValidation.method = 'failed'
```

## Defectos conocidos

Encontrados al especificar la web (2026-09/10); se corrigen en nativo, no se copian.

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 3 | CUS-CHK-012 | La vista de bloqueo se activa comparando el **texto** del error con `/bloquead/i`. | `use-checkout-actions.ts:357,374` |
| 10 | CUS-CHK-010 | El cliente regenera la clave de idempotencia ante cualquier 4xx (incluido el 409 «en proceso»). | `use-checkout-actions.ts:336-378` |

## Notas
- ✅ **Contradicción 6 resuelta el 2026-11-17 (todo recojo es prepago, CUS-CHK-028).** Texto original, ya reemplazado: CUS-CHK-004, CUS-CHK-006 y CA-CHK-01 copian la regla vieja de la web (recojo «ahora» con caja). El código (`packages/contracts/src/payment-rules.ts`) y la migración `0283` dicen que **todo recojo es prepago**, y Android ya lo hace (`checkout_pickup_now_hint`: «Pagas por adelantado…»). Se conservan los textos originales hasta que Jesús confirme y se reescriban.
- La pantalla piloto es `pantallas/CHK-confirmar-pedido.md`.

## Decisiones de Jesús, 2026-11-17

Los requisitos que cambian conservan su ID y llevan la marca **reemplazado por** o **retirado** en su fila; los nuevos siguen la numeración del área. Android: sin verificar contra el código (⬜ = por hacer); iOS aún no empieza. Donde se cita la junta del 17-nov (`tindivo-auditorias/2026-11-16-ux-movil/v3/junta-17nov/conclusion.md` y `junta-17nov-b/conclusion.md`), el detalle es propuesta de la junta, no decisión de Jesús.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-CHK-024 ★ | La app debe presentar «¿Cómo pagas?» según la confianza que decide el servidor: al cliente confiable, «Efectivo» y «Yape o Plin»; al no confiable, «Yape o Plin por adelantado». | Sin selector «Al recibir» / «Pagar ahora»: ya no existe. Confiable con «Yape o Plin»: «Ves el número cuando el negocio acepte»; el pago se hace en el seguimiento (CUS-PAY-014). No confiable: «Pagas apenas el local acepte»; «Efectivo» en gris con su motivo (CUS-CHK-023). La decisión sigue viniendo de la cotización (`trusted / no_history / risk_blocked`), nunca de la app. | Decisión de Jesús, 2026-11-17 (decisión 1; maquetas `Checkout`, `Checkout-confiable`, `Checkout-adelantado`) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-CHK-025 | La app debe rotular el pago digital «Yape o Plin», con los logos de Yape y de Plin. | Sustituye a «Billetera digital» con ícono genérico (CUS-CHK-022). Aplica en Checkout, Comprobante y Seguimiento. | Decisión de Jesús, 2026-11-17 (decisión 1) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-CHK-026 ★ | La app debe mostrar siempre «Subtotal», «Envío» y «Total» en el resumen del checkout. | Total = subtotal + envío; envío tachado si hay promoción (CUS-CHK-016). Resuelve la decisión F en lo del subtotal. | Decisión de Jesús, 2026-11-17 (decisión 13; la maqueta `Checkout` solo dibuja Envío y Total) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CHK-027 | Cuando el cliente no tiene historial (`validando`), la app debe decir «Te llamaremos para confirmar tu pedido» y, debajo, el número verificado. | 38 caracteres (tope 40). Sin plazo prometido. Redacción de la línea del número: la de la junta, «Te llamaremos al [número verificado]». Repetir el estado en el seguimiento (CUS-TRK-005). | Decisión de Jesús, 2026-11-17 (decisión 14; junta B, punto 6) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-CHK-028 ★ | Cuando el método es recojo, la app debe tratar todo recojo como prepago: solo «Yape o Plin por adelantado», sin preguntar «¿Vas al local ahora?». | Coincide con la migración `0283` y `packages/contracts/src/payment-rules.ts`. Texto: «Pagas por adelantado y lo preparamos apenas confirmemos el pago». Sin tarjeta de entrega (CUS-CHK-018). Cierra la contradicción 6 y la decisión E. | Decisión de Jesús, 2026-11-17 (decisión 9) | 🟡 | ⬜ | IGUAL · M1 |

Criterios de aceptación de las filas nuevas:
```
CA-CHK-07 · Todo recojo es prepago                                         (CUS-CHK-028)
  Dado una bolsa en modo recojo
  Cuando el cliente abre «¿Cómo pagas?»
  Entonces solo ve «Yape o Plin por adelantado»
  Y la app no pregunta «¿Vas al local ahora?»
  Y crear el pedido con un pago al recibir devuelve 422

CA-CHK-08 · El resumen siempre trae subtotal, envío y total                 (CUS-CHK-026)
  Dado cualquier pedido a domicilio con envío de S/ 2,50 y subtotal de S/ 31,00
  Entonces el resumen muestra Subtotal S/ 31.00, Envío S/ 2.50 y Total S/ 33.50

CA-CHK-09 · El confiable elige entre dos formas                             (CUS-CHK-024)
  Dado un cliente con decisión trusted
  Entonces «¿Cómo pagas?» muestra «Efectivo» y «Yape o Plin» y ningún selector «Al recibir» / «Pagar ahora»
```
**Retirados por esta decisión:** CA-CHK-01 (recojo «más tarde»), CA-CHK-02 (pregunta de recojo) y CA-CHK-P1 de `pantallas/CHK-confirmar-pedido.md` (selector). La contradicción 6 de `decisiones-abiertas.md` queda resuelta.
