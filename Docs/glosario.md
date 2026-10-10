# Glosario

> Verificado: 2026-10-10 · entorno: `develop@7d00aa4` (`packages/contracts/src/`, `supabase/migrations/`) y
> `tindivo-prod` (solo lectura)

El nombre oficial de cada cosa, cómo se llama en el código y los nombres que **ya no** se usan. Si un documento usa
un nombre retirado, el documento está viejo: manda este glosario (estándar §3.6).

## Servicios

| Nombre oficial | En el código | Qué es |
|---|---|---|
| **Pedido de restaurante** | `orders`, `ORDER_STATUSES` (`enums.ts`) | Un cliente pide comida a un negocio aliado, por la app o por teléfono a la cajera. Se entrega con motorizado (`delivery_method = 'delivery'`) o se recoge en el local (`'pickup'`) |
| **Recojo en el local** | `delivery_method = 'pickup'`, estado `ready_for_pickup` | El cliente recoge su pedido en el mostrador. En el mostrador no se fía: llega a cocina pagado |
| **Tindivo Entregas** | `courier_orders`, `courier_order_events`, `COURIER_TRANSITIONS` (`courier-status.ts`) | Llevar de un punto A a un punto B algo **ya coordinado y pagado**, dentro del pueblo. S/ 3 que paga el cliente; de lunes a domingo, de 18:00 a 23:00 (ADR 0035). No compra nada |
| **Tindivo Store** | `store_products`, `store_product_images`, `store_categories`, `store_events`; `STORE_STATUSES` (`store.ts`) | Catálogo de segunda mano de San Jacinto (`DECISIONS.md §32`) |

### Nombres retirados

| Ya no se dice | Porque | Dígase |
|---|---|---|
| **Encargos**, para el servicio de llevar de A a B | Se renombró el 2026-09-19 | **Tindivo Entregas** |
| **Encargos**, para «te lo compramos y te lo llevamos» | Servicio descartado el 2026-10-07 (ADR 0034) | No existe |
| **Tindivo Recojos** | Chocaba con el recojo en el local | **Tindivo Entregas** |
| `courier_requests`, `catalog_places` | Nombres de un plan técnico superado (`DECISIONS.md §31`) | `courier_orders`, `directory_businesses` |
| **Web v2** (proyecto `psjigdoinfpgrnedxeyf`) | Proyecto abandonado | **`tindivo-prod`** (`zpnipajgwfthxhdtzhly`) |
| **driver**, en la interfaz | Es el nombre del rol en el código, no en la UI | **motorizado** |

## Personas y roles

| Nombre | En el código | Qué hace |
|---|---|---|
| **Cliente** | rol `customer` | Pide por la app (`order_source = 'customer_pwa'`) |
| **Negocio**, y su **cajera** | rol `business` | Acepta y prepara pedidos; teclea los que le llegan por teléfono (`'business_manual'`, la mayoría) |
| **Motorizado** | rol `driver` | Recoge y entrega; cobra en la puerta y rinde lo cobrado |
| **Admin** | rol `admin` | Jesús: operación, cobros, apelaciones |
| **Aliado** | negocio en `businesses` con catálogo en Tindivo | Negocio que vende por Tindivo y paga comisión |
| **Negocio del directorio** | `directory_businesses` | Negocio conocido en el pueblo, aliado o no; sirve de punto A o B en Entregas y en el mapa |

Un mismo usuario puede tener varios roles (`users` + `user_roles`).

## Pedido de restaurante

| Término | En el código | Significado |
|---|---|---|
| **Validando** | `validando` | La cajera llama al cliente antes de aceptar (cliente nuevo o con strike en contraentrega). Antifraude humano |
| **Contraentrega** | `payment_intent` `pending_cash` · `pending_yape` · `pending_mixed` | Se paga al recibir: efectivo, Yape o una mezcla |
| **Prepago** | `payment_intent = 'prepaid'`, estado `awaiting_payment` | Se paga antes y se sube la captura del comprobante |
| **Cobro real** | `PAYMENT_REALS` (`paid_cash`, `paid_yape`, `paid_mixed`, `paid_prepaid`, `unpaid`, `refunded`) | Cómo se pagó de verdad al entregar |
| **Banda** (cerca / lejos) | `DISTANCE_BANDS` = `near` · `far` | La declara el motorizado al recoger; fija la tarifa de envío |
| **Sencillo** o **adelanto de vuelto** | `change_advanced` | El cambio que la cajera le da al motorizado antes de salir. Lo pone siempre la caja |
| **Lo que rinde el motorizado** | `cash_owed_at_delivery` | Adelanto + parte en efectivo del pedido; única fuente del corte de caja |
| **Corte de caja** | `cash_settlements` | La rendición del efectivo del motorizado al negocio |
| **Strike** | — | Marca a un cliente que falló una contraentrega; con strikes, va a validación o a prepago |
| **Jornada** o **fecha de servicio** | `serviceDate()` / `current_service_date()`; `SERVICE_DAY_START_HOUR = 5` | El día operativo: cambia a las **05:00 de Lima**, así que la madrugada es de la noche anterior |
| **Solo catálogo (WhatsApp)** | `catalog_only` | Negocio que muestra su carta pero no recibe pedidos por la web |

## Lugares

| Término | Qué es |
|---|---|
| **San Jacinto** | El pueblo del piloto (Áncash). Tindivo opera de noche |
| **`tindivo-prod`** | La base de producción (`zpnipajgwfthxhdtzhly`). **Operación real** |
| **El v1** | El sistema anterior, en `../tindivo-delivery`. Solo como referencia |
