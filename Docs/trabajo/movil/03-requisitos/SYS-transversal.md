# SYS · Reglas y servicios transversales del backend

> **Qué es:** las reglas que **viven en el servidor** (Postgres, RPC, crons, Edge Function) y que las
> apps de cliente, negocio, motorizado y admin **heredan sin reimplementarlas**. Son el dominio más
> valioso y más difícil de rehacer, y **no cambian con la migración móvil** (`IGUAL · M1`): lo que
> cambia es cómo se **exponen** (contrato, `ARQ-02`) y cómo se **notifican** (`NAT-PSH`).
> Formato y leyendas: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).
> Los valores ⚙ son de `app_settings` (medidos el 2026-09-20).

## SYS-EST · Máquina de estados del pedido

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-EST-001 ★ | El servidor debe mantener **12 estados**: `validando`, `pending_acceptance`, `awaiting_payment`, `confirmed`, `preparing`, `waiting_driver`, `heading_to_restaurant`, `waiting_at_restaurant`, `picked_up`, `ready_for_pickup`, `delivered`, `cancelled`. | Delivery: `[validando] → pending_acceptance → [awaiting_payment → validando] → confirmed → preparing → waiting_driver → heading_to_restaurant → waiting_at_restaurant → picked_up → delivered`. **Recojo:** `… → preparing → ready_for_pickup → delivered`. Cualquier no terminal → `cancelled`. | `contracts/order-status.ts:25-42`; enum `order_status` | ✅ | IGUAL · M1 |
| SYS-EST-002 ★ | **`delivered` y `cancelled` son terminales.** Nadie puede sacar un pedido de `delivered`. | Verificado contra las 8 funciones que escriben `orders.status`: `advance_order`, `expire_order`, `apply_order_transfer`, `cancel_customer_order`, `cancel_expired_prepay_orders`, `extend_order_prep`, `validate_order`, `create_customer_order`; **más** el `UPDATE` directo de `prepay-proof` (que exige `awaiting_payment`). La rama de reversión de `generate_delivery_charges` es **inalcanzable** a propósito. | `CLAUDE.md` invariante 8 | ✅ | IGUAL · M1 |
| SYS-EST-003 | Las acciones de `advance_order` deben ser: `accept`, `preparing`, `ready`, `take`, `arrived`, `pickup`, `arrived_customer`, `deliver`, `release`, `cancel`, `no_show`, `handover`, `pickup_no_show`. | Un solo escritor de estado (salvo `prepay-proof`, `DAT-05`). Cada acción valida el rol del actor. | `advance_order` (39 KB) | ✅ | IGUAL · M1 |
| SYS-EST-004 | Todo cambio de estado debe dejar **evento de dominio** (`domain_events`) y **registro** (`order_event_log`, `order_status_history`) en la **misma transacción**. | Triggers `trg_orders_log_status`, `trg_orders_outbox_events`. | `orders` (9 triggers) | ✅ | IGUAL · M1 |
| SYS-EST-005 | El servidor debe permitir **un solo pedido activo por cliente y negocio**. | Estados activos: `ACTIVE_ORDER_STATUSES`; el rechazo lleva `active_order_block:<id>:<shortId>:<estado>`. | `create_customer_order`; migración 0105 | ✅ | IGUAL · M1 |

## SYS-DIN · Dinero

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-DIN-001 ★ | **Tindivo no retiene fondos.** Yape, Plin y efectivo van **directo al negocio**. | Sin pasarela de pago ni comisión de tienda por compra en la app (bienes y servicios físicos). El «reembolso» de un prepago es una decisión del negocio que solo se registra. | `DECISIONS.md §4, §8` | ✅ | IGUAL · M1 |
| SYS-DIN-002 ★ | El envío se cobra al cliente por **dos bandas** (`near`/`far`) elegidas por el **pin** de entrega. | ⚙ `delivery_bands` 2.00/2.50; la decide `delivery_band_for_point` **dentro** de `create_customer_order` (el cliente no manda banda ni precio); en manual la elige la cajera. | 0126, 0162; `app_settings.delivery_bands` | ✅ | IGUAL · M1 |
| SYS-DIN-003 ★ | La **comisión** de Tindivo al negocio es por pedido **entregado** y se congela como *snapshot*. | ⚙ `commissions`: **recojo 1.00**, **delivery 1.50** (`DECISIONS.md §4` dice 1.00: desfase); `businesses.commission_override_pickup`; cancelados no suman. | 0110, 0125; `generate_delivery_charges` | ✅ | IGUAL · M1 |
| SYS-DIN-004 | El **libro** `business_charges` es la fuente; `balance_due` es **derivado** (trigger de recálculo). | Comisión y envío en cargos separados; apelaciones aprobadas entran como `refund_charge`. Límite de crédito ⚙ 600 **solo avisa**. | 0073-0077, 0124, 0179 | ✅ | IGUAL · M1 |
| SYS-DIN-005 | El motorizado cobra **sueldo fijo** (~S/30/noche), sin comisión por entrega. | Liquidación de efectivo **diaria**, una por pedido (0157); auto-confirmación 24 h eliminada (0112). | `DECISIONS.md §4` | ✅ | IGUAL · M1 |
| SYS-DIN-006 ★ | Los importes deben ser `numeric(10,2)`; el servidor **recalcula** los montos desde precios *snapshot* del menú (no confía en el cliente). | `customer_order_items.*_snapshot`; total = `order_amount + delivery_fee`. | `contracts/requests.ts:41-44` | ✅ | IGUAL · M1 |

## SYS-PAG · Formas de pago y prepago

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-PAG-001 ★ | El pago se declara con `payment_intent`: `pending_cash`, `pending_yape`, `pending_mixed` (**solo manual**), `prepaid`; lo realmente cobrado con `payment_real`: `paid_prepaid/yape/cash/mixed`, `unpaid`, `refunded`. | `pending_yape` significa «transfiere **al motorizado** al recibir»; **no existe en un mostrador**. | enums; `contracts/payment-rules.ts` | ✅ | IGUAL · M1 |
| SYS-PAG-002 ★ | **Prepago obligatorio** sobre ⚙ `prepay_threshold` (**80**, comparado contra total **con envío**), por riesgo, o en recojo «más tarde»; opcional por debajo. | El servidor recalcula el total; mensaje: «El total con envío (S/ x) pasa de S/ y, así que el pago debe ser adelantado.» | `create_customer_order`; `customer/orders/route.ts:115-176` | ✅ | IGUAL · M1 |
| SYS-PAG-003 ★ | En **recojo del canal cliente**: «ahora» admite caja (efectivo o billetera) o prepago; «más tarde» solo prepago; CHECK `orders_pickup_payment_chk` como suelo. **Solo aplica a `source = customer_pwa`** (`ARQ-08`). | El cobro de «ahora» entra **al aceptar** (0224): `payment_verified_at` es el predicado único de «hay dinero dentro». Un plantón **pagado no deja strike**. | 0223, 0224 | ✅ | IGUAL · M1 |
| SYS-PAG-004 ★ | El prepago debe pasar por **tres esperas con plazo** y **máx. 2 comprobantes**. | Aceptación ⚙ 8 → pago ⚙ 15 → verificación ⚙ 10; comprobante en `payment-proofs` (privado). | 0058, 0059, 0158, 0159, 0168, 0186 | ✅ | IGUAL · M1 |
| SYS-PAG-005 | El **vuelto** se limita por ⚙ `max_cash_bill` y por el sencillo que la caja declara esa noche. | `effective_max_change(business)`; el negocio manda sobre el techo global. | 0131, 0146, 0185 | ✅ | IGUAL · M1 |

## SYS-PLZ · Plazos y temporizadores

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-PLZ-001 ★ | Los plazos deben salir de **`app_settings.timers`** y **de ningún otro sitio**. | Una sola función barre: `cancel_expired_prepay_orders()` (pg_cron cada **minuto**, hasta 60 s de desfase); Inngest programa el mismo `expire_order` de forma exacta (idempotente). **Si se añade un plazo, que lo lea de ahí.** | 0174; `inngest/functions.ts`; `cron.job` | ✅ | IGUAL · M1 |
| SYS-PLZ-002 ★ | Valores vivos: aceptación **8** min · pago **15** · verificación **10** · validación por llamada **5** · espera del motorizado en puerta **5** · extensión de preparación **10** (máx. **2**) · lead de cola **10** · trayecto **20-25** · TTL traspaso **30** s · retraso de reparto **20** · gracia de turno **10**. | Editables desde admin; la app **no los escribe**. | `app_settings.timers` | ✅ | IGUAL · M1 |
| SYS-PLZ-003 | Otros procesos por reloj: cierre de turno de motorizados (cada 15 min), `flag-overdue-orders` (emite `OrderOverdue` una vez y sella `urgent_since`), `announce-queued-orders` (emite `OrderQueued`), `expire-order-transfers`. | Crons de 1 min; los pedidos de **recojo** no se anuncian a la cola. | `cron.job` | ✅ | IGUAL · M1 |

## SYS-FRD · Antifraude

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-FRD-001 ★ | **Validación humana por llamada** para cliente nuevo, monto grande o con strike; el prepago no se llama. | El pedido entra a `validando` ⚙ 5 min; la cajera lo resuelve; el recojo «ahora» nunca entra aquí (la cajera lo mira). | `DECISIONS.md §8` | ✅ | IGUAL · M1 |
| SYS-FRD-002 ★ | **Strikes** anclados a **teléfono Y dirección** a la vez. | **2 strikes → contraentrega bloqueada** (solo prepago; **no expira**); **3 → bloqueo total** ⚙ 30 días (`blocked_until`). El bloqueo aplica también al canal manual. Sin botón «paga y vuelve»: solo `strike_reactivation` revisado por admin. | `customer_strikes`; 0040, 0044, 0071 | ✅ | IGUAL · M1 |
| SYS-FRD-003 ★ | `customer_contraentrega_decision` debe devolver `risk_blocked` / `trusted` / `no_history`, con el **riesgo por encima de cualquier historial**. | **`compra_previa`** (basta una): (1) pedido `delivered` de la cuenta; (2) pedido `delivered` del **teléfono verificado** (incluye los de la cajera); (3) **cualquier fila del directorio** para ese teléfono. El teléfono sale **siempre del perfil verificado**, nunca del pedido. | función leída; 0171, 0182 | ✅ | IGUAL · M1 |
| SYS-FRD-004 ★ | **Señal de GPS:** un cliente sin historial cuyo GPS **en vivo** cae dentro del polígono puede elegir contraentrega pero entra a `validando`. | **No equivale a `compra_previa`**: el GPS del navegador se falsifica sin root. Métodos válidos: `gps_high_accuracy`, `gps_low_accuracy` (nunca `manual_skip_prepaid` ni `failed`). En nativo se puede **fortalecer** (`NAT-FRD-*`). | `DECISIONS.md §8`; 0211 | ✅ | IGUAL · M1 |
| SYS-FRD-005 | **Protocolo de no-show** (motorizado o mostrador): espera ⚙ 5 min → strike + reporte + aviso inmediato al cliente. | El del mostrador ancla solo por teléfono (no hay dirección) y no penaliza si el pedido estaba pagado. | 0114, 0220, 0224 | ✅ | IGUAL · M1 |
| SYS-FRD-006 | Un negocio suspendido **no recibe pedidos** ni por enlace directo. | `trg_orders_business_not_blocked`; la suspensión es de un admin, no automática. | 0178, 0179 | ✅ | IGUAL · M1 |

## SYS-NOT · Notificaciones (estado actual)

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-NOT-001 | El servidor debe emitir **14 tipos de evento con destinatario humano**: `OrderStatusChanged`, `OrderExpired`, `OrderCreated`, `OrderQueued`, `OrderReleased`, `OrderOverdue`, `OrderProofVerified`, `OrderValidated`, `TransferRequested`, `TransferResolved`, `CashDelivered`, `CashConfirmed`, `CashDisputed`, `CashResolved`. | **Lista blanca explícita** en `dispatch_event`; lo que no está (`BusinessBlocked`, `CustomerNoShow`, `OrderPrepExtended`, `order/appeal.created`) es auditoría. | `dispatch_event` | ✅ | IGUAL · M1 |
| SYS-NOT-002 ★ | El `tag` de colapso debe incluir el **tipo de evento** (no solo el `short_id`). | `${eventType}-${action}-${shortId}`; el doble aviso de traspaso lleva **tags distintos**. En APNs el colapso admite **≤ 64 bytes** (`NOT-05`). | `send-push/index.ts` | ⚠️ | ADAPTAR · M1 |
| SYS-NOT-003 | **Notificar no es asignar**: el aviso a motorizados no se filtra por `is_available`. | Evita el bloqueo circular tras el cierre de turno. | `send-push/index.ts:160-177,552-559` | ✅ | IGUAL · M1 |
| SYS-NOT-004 | Todo intento debe registrarse en `push_delivery_log` y purgar suscripciones muertas (404/410). | Retención 30 días. Hoy: 7 764 ok / 4 error (≤ 30 días). | `send-push`; cron `prune-push-delivery-log` | ✅ | IGUAL · M1 |
| SYS-NOT-005 | El **outbox** debe publicar y reintentar. | ⚠️ Hoy 0 de 5 620 eventos marcados como publicados (`NOT-01`). | `domain_events` | ⚠️ | NUEVO · M1 |

### Catálogo de avisos al **cliente** (base del catálogo nativo)

Extraído de `supabase/functions/send-push/index.ts`. La **prioridad, el TTL y el canal** son una
**propuesta** para APNs/FCM (no existen hoy). «Req.» = hoy sale con `requireInteraction` + vibración.

| # | Momento | Título · Cuerpo (resumen) | Hoy | Prioridad nativa propuesta | TTL propuesto | Canal |
|---|---|---|---|---|---|---|
| 1 | Negocio acepta (efectivo o recojo) | «{negocio} aceptó tu pedido» · «Ya está en cocina · listo en ~N min» (recojo: «te avisamos cuando puedas pasar») | normal | Normal | 2 h | `order_updates` |
| 2 | Negocio acepta (**prepago**) | «Ya puedes pagar tu pedido» · «S/ X por Yape a {negocio} · tienes N min o se cancela solo» | **Req.** | **Alta** | plazo restante (⚙ 15 min) | `order_updates` |
| 3 | Comprobante verificado | «Pago verificado» · «{negocio} ya está cocinando» | normal | Normal | 2 h | `order_updates` |
| 4 | Antifraude aprobado | «Pedido verificado» · «Todo en orden · tu pedido sigue su curso» | normal | Normal | 1 h | `order_updates` |
| 5 | Comprobante rechazado (queda 1 intento) | «Tu comprobante no se pudo verificar» · «Te queda 1 intento · sube otra captura» | **Req.** | **Alta** | plazo restante | `order_updates` |
| 6 | Comprobante rechazado (final) | «Tu pedido se canceló» · «No se pudo verificar el comprobante de pago» | **Req.** | **Alta** | 24 h | `order_updates` |
| 7 | **Recojo listo** | «Tu pedido está listo» · «Pásalo a recoger en {negocio}» | **Req.** | **Alta** (interrupción con límite de tiempo) | 1 h | `order_updates` |
| 8 | Pedido recogido por el motorizado | «Tu pedido salió» · «{nombre} va en camino» (sin ETA a propósito) | normal | Normal | 1 h | `order_updates` |
| 9 | **Motorizado en la puerta** | «{nombre} está en tu puerta» · «Sal a recibirlo · si no sales en N min puede cancelar el pedido» | **Req.** | **Alta** (la más urgente) | ⚙ 5-10 min | `order_updates` |
| 10 | No-show del motorizado | «Tu pedido se canceló» · «{nombre} esperó N min en tu puerta y nadie salió» | **Req.** | **Alta** | 24 h | `order_updates` |
| 11 | Plantón de recojo | «Tu pedido se canceló» · «estuvo listo en el local más de N min y nadie pasó a recogerlo» | **Req.** | **Alta** | 24 h | `order_updates` |
| 12 | Entregado | «Pedido entregado» · «S/ X · gracias por pedir en Tindivo» | normal | Normal | 24 h | `order_updates` |
| 13 | Recojo completado | «¡Gracias por tu recojo!» · «La próxima te lo llevamos a casa · pagas al recibir» | normal | **Baja** (invitación, no urgencia) | 24 h | `order_updates` |
| 14 | Cancelado (negocio/admin/cliente) | «Tu pedido se canceló» · «Puedes volver a pedirlo cuando quieras» | normal | Normal | 24 h | `order_updates` |
| 15 | Prepago vencido | «Tu pedido se canceló» · «No llegó el pago a tiempo · puedes volver a pedirlo» | normal | Normal | 24 h | `order_updates` |

**Reglas de contenido:** el nombre del motorizado va **solo de pila**; el motivo interno de
cancelación **no viaja al cliente**; el monto usa la misma fórmula que `get_tracking.total`; sin ETA
en los avisos (la pantalla lo calcula). El **total** y el resto de textos deben salir de la **misma
fuente** que la pantalla para no divergir (`NOT-05`).

## SYS-AUT · Autenticación, roles y datos de sesión

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-AUT-001 ★ | El servidor debe ser **multi-rol** desde el día 1: `users` + `user_roles` (`customer`, `business`, `driver`, `admin`) + helpers `SECURITY DEFINER` (`current_user_has_role`, `current_business_id`, `current_driver_id`). | `search_path` fijado en todos; `public.users.id = auth.users.id`. Hoy: 85 `customer`, 4 `driver`, 4 `business`, 1 `admin`. | 0004, 0008; `DECISIONS.md §12` | ✅ | IGUAL · M1 |
| SYS-AUT-002 | La API debe autenticar con `Authorization: Bearer <jwt>` (no cookies). | ⚠️ Hoy valida el JWT contra GoTrue en cada petición y consulta `user_roles` (`PER-01`). | `apps/api/lib/http/auth.ts` | ⚠️ | ADAPTAR · M1 |
| SYS-AUT-003 | El servidor debe conservar **una sesión por app** en web (clave de almacenamiento por app). | En nativo no aplica (Keychain/Keystore por app). | `packages/supabase/src/client-helpers.ts:20-26` | ✅ | SOLO-WEB · W |

## SYS-DAT · Datos, almacenamiento y ejecución programada

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-DAT-001 | Almacenamiento: `business-logos`, `business-qrs`, `menu-items` (**públicos**, 3 MB, webp/jpeg/png) y `payment-proofs`, `receipts` (**privados**, RLS por carpeta de usuario). | ⚠️ Los privados no tienen límite de tamaño ni de tipo (`SEC-05`). | `storage.buckets` | ✅ | IGUAL · M1 |
| SYS-DAT-002 | Tiempo real: publicación `supabase_realtime` con 7 tablas; *Broadcast* privado `drivers:board`. | Para el cliente nativo: canal por pedido, no `postgres_changes` (`PER-05`). | `pg_publication_tables` | ✅ | ADAPTAR · M1 |
| SYS-DAT-003 | Jobs `pg_cron` (11): 4 barridos de 1 min, cierre de turnos (15 min) y 6 de limpieza diaria con retención definida. | `prune-domain-events` 90 d; `push-delivery-log` 30 d; `idempotency-keys` 24 h. | `cron.job` | ✅ | IGUAL · M1 |
| SYS-DAT-004 | Idempotencia con `idempotency_keys(key uuid, scope, request_hash, status)`. | ⚠️ 4 de 49 rutas; clave atascable (`DAT-01`). | `apps/api/lib/http/idempotency.ts` | ⚠️ | ADAPTAR · M1 |
| SYS-DAT-005 | El catálogo público debe cachearse en el borde. | `Cache-Control: public, s-maxage=15, stale-while-revalidate=45`. | `public/businesses/[id]/route.ts:180-183` | ✅ | IGUAL · M1 |

## SYS-ERR · Contrato de errores

| ID | Requisito | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| SYS-ERR-001 ★ | Toda respuesta de error debe ser **RFC 9457** (`application/problem+json`) con `type`, `title`, `status`, `code`, `detail`, `requestId`, `errors[]`. | 12 códigos: `validation_error` 422, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `idempotency_conflict` 409, `rate_limited` 429, `invalid_state_transition` 409, `business_blocked` 403, `order_not_cancellable` 409, `payment_required` 402, `internal_error` 500. | `apps/api/lib/http/problem.ts`; `contracts/errors.ts` | ✅ | IGUAL · M1 |
| SYS-ERR-002 ★ | Las reglas de negocio deben rechazarse con **códigos de dominio estables** y parámetros. | ⚠️ Hoy son frases en español con `P0001` (`DAT-02`). | — | ⚠️ | NUEVO · M1 |
| SYS-ERR-003 | Toda petición debe llevar `x-request-id` y la respuesta devolverlo. | Ya existe entre cliente y API; falta llevarlo a base y Edge Function (`PRO-05`). | `lib/http/request-id.ts` | 🟡 | IGUAL · M1 |

## SYS-CFG · Parámetros operativos (`app_settings`, 21 claves)

`assignment_rules` · `commissions` · `coverage` · `coverage_polygon` · `debt_block_threshold` ·
`delivery_bands` · `fraud_coverage` · `location_validation` · `max_cash_bill` · `max_change` ·
`order_intake_cutoff` · `platform_schedule` · `prepay_threshold` · `promo_free_delivery` ·
`push_dispatch` · `reviews` · `strikes` · `support_whatsapp` · `terms_version` · `timers` ·
`validation`.
La exposición para la app (`GET /config`, `MOB-02`) debe incluir **solo lo que el cliente necesita**
(no `push_dispatch`, que contiene la *anon key* y la URL de la función: `SEC-01`).
