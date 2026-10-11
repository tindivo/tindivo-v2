# Anexo A · Superficie de la API (85 rutas)

> **Generado por script** leyendo cada `route.ts` de `apps/api/app/api` en `HEAD 09749a4` (2026-09-20). Es la base de
> `01-sistema-actual/03-superficie-api.md` y de la propuesta de **superficie móvil** (`ARQ-01`). Las columnas «RPC»,
> «Tablas» y «Storage» son lo que el código **de la ruta** llama; no incluyen lo que hacen las RPC por dentro.

**Totales:** 85 rutas · 49 mutan datos · **4 con `Idempotency-Key`** · **0 con *rate limiting*** · 1 responde sin envoltura (`raw`) · 41 RPC distintas · 32 tablas tocadas.

**Auth:** `role:X` = exige el rol X (consulta `user_roles`) · `user` = cualquier sesión válida · `public?` = sin sesión.
**Banderas:** `idem` = idempotencia · `usr` = usa el cliente con el JWT del usuario (el resto usa *service-role*) · `raw` = sin envoltura `{data}` · `twilio` · `inngest` · `paging?` = parece tener límite/paginación (verificar).

## Cliente (`/customer/*`) — 8 rutas

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/customer/appeals` | GET | role:customer | — | `reports`, `storage:payment-proofs` | usr | 63 |
| `/customer/orders/:id/appeal` | GET, POST | role:customer | `create_appeal_report` | `reports`, `storage:payment-proofs` | usr | 106 |
| `/customer/orders/:id/cancel` | POST | role:customer | `cancel_customer_order` | — | — | 42 |
| `/customer/orders/:id/prepay-info` | GET | role:customer | — | `orders`, `businesses`, `business_payment_qrs` | — | 73 |
| `/customer/orders/:id/prepay-proof` | POST | role:customer | — | `orders`, `order_event_log` | inngest | 80 |
| `/customer/orders` | POST | role:customer | `customer_contraentrega_decision`, `create_customer_order` | `customer_profiles`, `app_settings`, `menu_items`, `menu_modifier_options`, `businesses`, `business_schedule`, `order_event_log` | idem, inngest | 393 |
| `/customer/phone/send-code` | POST | role:customer | — | `customer_otp_attempts` | twilio, paging? | 149 |
| `/customer/phone/verify` | POST | role:customer | — | `customer_profiles` | twilio | 122 |

## Públicas (`/public/*`) — sin sesión

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/public/businesses/:id` | GET | public? | `current_service_date` | `businesses`, `menu_categories`, `menu_items`, `menu_modifier_groups`, `menu_modifier_options`, `menu_item_modifier_groups`, `business_schedule` | — | 192 |
| `/public/businesses` | GET | public? | `current_service_date` | `businesses`, `business_schedule` | — | 98 |
| `/public/orders/:shortId` | GET | public? | `get_tracking` | — | raw | 35 |
| `/public/pilot-access` | POST | public? | — | — | — | 23 |
| `/public/schedule` | GET | public? | `get_order_intake_status` | — | — | 37 |
| `/public/search` | GET | public? | `search_catalog` | — | paging? | 33 |

## Push (`/push/*`) — cualquier usuario autenticado

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/push/subscriptions/me` | GET | user | — | `push_subscriptions` | — | 38 |
| `/push/subscriptions` | POST, GET, DELETE | user | — | `push_subscriptions` | paging? | 252 |

## Negocio (`/business/*`)

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/business/account/refunds/:id` | GET | role:business | — | `businesses`, `business_charges`, `reports`, `orders`, `order_event_log`, `storage:payment-proofs` | — | 221 |
| `/business/account/summary` | GET | role:business | — | `businesses`, `app_settings`, `business_charges`, `orders`, `restaurant_payments` | paging? | 176 |
| `/business/cash-settlements/:id/confirm` | POST | role:business | `confirm_order_cash` | — | — | 46 |
| `/business/cash-settlements/:id/dispute` | POST | role:business | `dispute_cash_settlement` | — | — | 47 |
| `/business/fraud-claims` | POST | role:business | `create_fraud_claim` | — | idem | 60 |
| `/business/orders/:id/extend-prep` | POST | role:business | `extend_order_prep` | — | — | 38 |
| `/business/orders/:id/notify-pickup` | POST | role:business | `mark_pickup_notified` | — | — | 45 |
| `/business/orders/:id/prepay-proof` | GET | role:business | — | `businesses`, `orders`, `storage:payment-proofs` | — | 67 |
| `/business/orders/:id/request-validation` | POST | role:business | `request_order_validation` | — | — | 34 |
| `/business/orders/:id` | PATCH | role:business | `update_business_manual_order` | `orders` | — | 123 |
| `/business/orders/:id/transition` | POST | role:business | — | — | — | 18 |
| `/business/orders/:id/validate` | POST | role:business | `validate_order` | — | inngest | 80 |
| `/business/orders` | POST | role:business | `create_business_manual_order` | — | — | 115 |
| `/business/pause` | POST, DELETE | role:business | `pause_business_orders`, `resume_business_orders` | — | — | 60 |
| `/business/payment-qrs` | GET, PUT, PATCH, DELETE | role:business | — | `businesses`, `business_payment_qrs` | paging? | 170 |
| `/business/profile` | PATCH | role:business | — | `businesses` | — | 79 |
| `/business/reports/rendimiento/pdf` | GET | role:business | — | — | — | 54 |
| `/business/reports/rendimiento` | GET | role:business | — | — | — | 39 |

## Motorizado (`/driver/*`)

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/driver/availability` | GET, POST | role:driver | `is_within_platform_schedule`, `set_driver_availability` | `drivers` | — | 66 |
| `/driver/cash-settlements` | GET, POST | role:driver | `deliver_order_cash` | `drivers`, `orders`, `cash_settlements` | — | 256 |
| `/driver/incidents` | POST, GET | role:driver | `create_customer_incident` | `customer_incidents` | idem, paging? | 89 |
| `/driver/orders/:id/address` | POST | role:driver | `capture_delivery_address` | — | — | 81 |
| `/driver/orders/:id` | GET | role:driver | — | `drivers`, `orders`, `driver_restaurants`, `customer_order_items`, `businesses`, `order_transfer_requests`, `business_payment_qrs` | — | 217 |
| `/driver/orders/:id/transfer-request` | POST | role:driver | `request_order_transfer` | — | idem, inngest | 79 |
| `/driver/orders/:id/transition` | POST | role:driver | — | — | — | 18 |
| `/driver/team` | GET | role:driver | — | `drivers`, `orders`, `order_transfer_requests` | — | 173 |
| `/driver/transfers/:id/respond` | POST | role:driver | `respond_order_transfer` | — | — | 45 |

## Admin (`/admin/*`)

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/admin/appeals/:id/refund` | POST | role:admin | `register_appeal_refund` | — | usr | 49 |
| `/admin/appeals/:id/resolve` | POST | role:admin | `resolve_appeal` | — | usr | 47 |
| `/admin/appeals/:id/review` | POST | role:admin | `mark_appeal_in_review` | — | usr | 43 |
| `/admin/appeals` | GET | role:admin | — | `reports` | usr, paging? | 73 |
| `/admin/audit` | GET | role:admin | — | `orders`, `order_event_log` | paging? | 45 |
| `/admin/businesses/:id/block` | POST | role:admin | `block_business` | — | — | 52 |
| `/admin/businesses/:id/pending-band-orders` | GET | role:admin | — | `business_charges`, `orders` | — | 55 |
| `/admin/businesses/:id` | GET, PATCH | role:admin | — | `businesses` | — | 172 |
| `/admin/businesses/:id/unblock` | POST | role:admin | `unblock_business` | — | — | 34 |
| `/admin/businesses` | GET, POST | role:admin | — | `businesses`, `users`, `user_roles` | — | 102 |
| `/admin/cash-settlements/:id/resolve` | POST | role:admin | `resolve_cash_settlement` | — | — | 46 |
| `/admin/cash-settlements` | GET | role:admin | — | `cash_settlements` | paging? | 56 |
| `/admin/charges/history` | GET | role:admin | — | `restaurant_payments` | paging? | 54 |
| `/admin/charges` | GET | role:admin | — | `business_charges` | — | 88 |
| `/admin/charges/settle` | POST | role:admin | `settle_business_charges` | — | — | 52 |
| `/admin/charges/summary` | GET | role:admin | — | `businesses`, `business_charges` | — | 94 |
| `/admin/conversion-stats` | GET | role:admin | `admin_conversion_opportunity_stats` | — | — | 28 |
| `/admin/delivery-zones` | GET, POST, PATCH, DELETE | role:admin | — | `delivery_zones` | — | 132 |
| `/admin/drivers/:id/restaurants` | GET, PUT | role:admin | — | `driver_restaurants`, `drivers` | — | 101 |
| `/admin/drivers/:id` | PATCH | role:admin | — | `drivers`, `driver_availability` | — | 68 |
| `/admin/drivers` | GET, POST | role:admin | — | `drivers`, `users`, `user_roles`, `driver_availability` | — | 102 |
| `/admin/fraud-claims/:id/resolve` | PUT | role:admin | `resolve_fraud_claim` | — | — | 43 |
| `/admin/fraud-claims` | GET | role:admin | — | `fraud_coverage_claims` | paging? | 31 |
| `/admin/impersonate/:userId` | POST | role:admin | — | — | — | 52 |
| `/admin/incidents/:id/review` | PUT | role:admin | `review_customer_incident` | — | — | 39 |
| `/admin/incidents` | GET | role:admin | — | `customer_incidents` | paging? | 33 |
| `/admin/map-landmarks` | GET, POST, PATCH, DELETE | role:admin | — | `map_landmarks` | — | 116 |
| `/admin/metrics` | GET | role:admin | `admin_metrics` | — | — | 45 |
| `/admin/online-stats` | GET | role:admin | `admin_online_orders_stats` | — | — | 37 |
| `/admin/orders/:id/cancel` | POST | role:admin | `advance_order` | — | — | 45 |
| `/admin/orders/:id/distance-band` | PATCH | role:admin | `admin_correct_delivery_band` | — | — | 49 |
| `/admin/orders/:id/prepay-proof` | GET | role:admin | — | `orders`, `storage:payment-proofs` | — | 56 |
| `/admin/orders/:id` | GET | role:admin | — | `orders`, `customer_order_items`, `business_charges`, `order_status_history`, `order_event_log`, `customer_strikes`, `users` | — | 176 |
| `/admin/orders` | GET | role:admin | — | `orders` | paging? | 32 |
| `/admin/promo` | GET | role:admin | `admin_promo_free_delivery_stats` | — | — | 38 |
| `/admin/reports/:id/resolve` | POST | role:admin | — | `reports` | — | 67 |
| `/admin/reports` | GET | role:admin | — | `reports` | paging? | 42 |
| `/admin/reviews` | GET | role:admin | — | `order_reviews` | paging? | 66 |
| `/admin/settings` | GET, PATCH | role:admin | — | `app_settings` | — | 120 |
| `/admin/strikes` | GET | role:admin | — | `customer_profiles` | paging? | 31 |

## Sistema (`/health`, `/inngest`)

| Ruta | Métodos | Auth | RPC | Tablas / Storage | Banderas | Líneas |
|---|---|---|---|---|---|---|
| `/inngest` | — | public? | — | — | inngest | 9 |
| `/health` | GET | public? | — | — | — | 16 |

## Rutas que mutan y **no** usan idempotencia (49 − 4 = 45)

Las cuatro que sí: `/business/fraud-claims`, `/customer/orders`, `/driver/incidents`, `/driver/orders/:id/transfer-request`. Las más relevantes para el móvil (cliente):
`POST /customer/orders/:id/cancel`, `POST /customer/orders/:id/prepay-proof`, `POST /customer/orders/:id/appeal`, `POST /customer/phone/send-code`, `POST /customer/phone/verify`, `POST /push/subscriptions` (ver `DAT-01`).
