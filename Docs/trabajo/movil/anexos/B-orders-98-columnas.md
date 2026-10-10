# Anexo B · `orders`: las 98 columnas por preocupación

> **Generado por script** con la lista de columnas leída de `information_schema` en `tindivo-prod` (2026-09-20).
> Sirve para **diseñar el modelo de lectura móvil** (`ARQ-05`, `ARQ-01`): la app de cliente **no** debe ver la tabla, sino un
> `customer_order_view` con lo marcado ✔. La columna «Hoy al cliente» indica qué devuelve ya `get_tracking` (público por `short_id`) y con qué nombre.

## Identidad y ciclo de vida (7)

| Columna | Hoy al cliente |
|---|---|
| `id` | — |
| `order_number` | ✔ `orderNumber` |
| `short_id` | ✔ `shortId` |
| `source` | — |
| `is_manual` | — |
| `created_at` | ✔ `createdAt` |
| `updated_at` | — |

## Partes involucradas (4)

| Columna | Hoy al cliente |
|---|---|
| `business_id` | — |
| `driver_id` | — |
| `customer_user_id` | — |
| `address_directory_id` | — |

## Cliente (instantánea) (2)

| Columna | Hoy al cliente |
|---|---|
| `customer_name` | — |
| `customer_phone` | — |

## Destino de entrega (11)

| Columna | Hoy al cliente |
|---|---|
| `delivery_method` | ✔ `deliveryMethod` |
| `delivery_address` | — |
| `delivery_reference` | — |
| `delivery_coordinates_lat` | — |
| `delivery_coordinates_lng` | — |
| `delivery_coordinates_accuracy_m` | — |
| `delivery_location_confirmed_at` | — |
| `delivery_maps_url` | — |
| `delivery_distance_band` | — |
| `delivery_fee_source` | — |
| `pickup_timing` | — |

## Importes y comisión (6)

| Columna | Hoy al cliente |
|---|---|
| `order_amount` | ✔ `amount` |
| `delivery_fee` | ✔ `deliveryFee` |
| `delivery_fee_charged` | — |
| `tindivo_commission` | — |
| `commission_amount` | — |
| `cash_owed_at_delivery` | — |

## Pago y comprobante (18)

| Columna | Hoy al cliente |
|---|---|
| `payment_intent` | ✔ `paymentIntent` |
| `payment_real` | — |
| `yape_amount` | — |
| `cash_amount` | — |
| `client_pays_with` | ✔ `paysWith` |
| `change_to_give` | ✔ `changeToGive` |
| `change_advanced` | — |
| `yape_confirmed` | — |
| `comprobante_prepago_url` | ✔ `proofUrl` |
| `payment_proof_status` | — |
| `payment_verified_at` | ✔ `paymentVerifiedAt` |
| `payment_verified_by` | — |
| `proof_attempt` | ✔ `proofAttempt` |
| `rejection_reason_code` | — |
| `rejection_reason_text` | — |
| `rejected_at` | — |
| `rejected_by` | — |
| `cash_settlement_id` | — |

## Preparación y reloj de cocina (11)

| Columna | Hoy al cliente |
|---|---|
| `prep_time_minutes` | — |
| `estimated_ready_at` | ✔ `estimatedReadyAt` |
| `appears_in_queue_at` | — |
| `queue_notified_at` | — |
| `prep_extended_at` | — |
| `prep_extension_count` | — |
| `ready_early_used` | ✔ `readyEarlyUsed` |
| `ready_early_at` | ✔ `readyEarlyAt` |
| `ready_for_pickup_at` | — |
| `occupancy_slots` | — |
| `urgent_since` | — |

## Estado y sellos de tiempo (16)

| Columna | Hoy al cliente |
|---|---|
| `status` | ✔ `status` |
| `pending_acceptance_at` | ✔ `pendingAcceptanceAt` |
| `validating_at` | ✔ `validatingAt` |
| `awaiting_payment_at` | ✔ `awaitingPaymentAt` |
| `confirmed_at` | — |
| `preparing_at` | — |
| `waiting_driver_at` | — |
| `heading_at` | — |
| `waiting_at_restaurant_at` | — |
| `picked_up_at` | — |
| `assigned_at` | — |
| `arrived_at_customer_at` | ✔ `arrivedAtCustomerAt` |
| `arrived_at_customer_lat` | — |
| `arrived_at_customer_lng` | — |
| `arrived_at_customer_accuracy_m` | — |
| `delivered_at` | ✔ `deliveredAt` |

## Cancelación (5)

| Columna | Hoy al cliente |
|---|---|
| `cancelled_at` | — |
| `cancelled_by` | — |
| `cancel_reason` | ✔ `cancelReason` |
| `cancel_reason_detail` | — |
| `cancel_note` | — |

## Notas y avisos (5)

| Columna | Hoy al cliente |
|---|---|
| `customer_notes` | ✔ solo el dueño (RLS) |
| `business_notes` | — |
| `driver_notes` | — |
| `tracking_link_sent_at` | — |
| `tracking_link_sent_by` | — |

## Antifraude y validación (13)

| Columna | Hoy al cliente |
|---|---|
| `requires_validation` | — |
| `validated_at` | — |
| `validated_by` | — |
| `validation_result` | — |
| `validation_reason_code` | — |
| `validation_context` | — |
| `risk_flags` | — |
| `customer_gps_lat` | — |
| `customer_gps_lng` | — |
| `customer_gps_accuracy_m` | — |
| `customer_gps_distance_to_center_km` | — |
| `customer_gps_validated_at` | — |
| `customer_gps_method` | — |

**Total: 98 columnas** (98 clasificadas).

## Lo que **no** debe ver el cliente en un modelo de lectura

`business_notes`, `driver_notes`, `customer_phone` de otros, `risk_flags`, `validation_*`, `customer_gps_*` (evidencia antifraude),
`tindivo_commission`, `commission_amount`, `delivery_fee_charged`, `cash_owed_at_delivery`, `*_by` (quién actuó), `rejection_reason_*`
(la cajera), `tracking_link_sent_*`, `urgent_since`, `occupancy_slots`, `cash_settlement_id`.