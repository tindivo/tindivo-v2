# 02 · Modelo de datos actual

> Fotografía de `tindivo-prod` (Postgres 17, migración 0230, 2026-09-20): **45 tablas**, todas con RLS;
> **106 funciones** en `public` (88 `SECURITY DEFINER`); **20 tipos enumerados**; **11 jobs** de
> `pg_cron`; **7 tablas** en la publicación de Realtime; **5 buckets** de Storage. Las cifras de filas
> son estimaciones del planificador. Los hallazgos están en `../02-auditoria-backend/`.

## Tablas por dominio

### Identidad y roles
| Tabla | Para qué | Filas | Notas |
|---|---|---|---|
| `users` | Espejo de `auth.users` (`id` igual) | 86 | `primary_role`, `email`, `is_active` |
| `user_roles` | Multi-rol (`customer`, `business`, `driver`, `admin`) | 94 | 85 `customer`, 4 `driver`, 4 `business`, 1 `admin` (una persona puede tener varios) |
| `customer_profiles` | Perfil del cliente | 76 | `phone` único, `phone_verified_at`, `strikes`, `contraentrega_blocked`, `blocked_until`, **dirección por defecto duplicada** (`default_*`) |
| `terms_acceptance` | Aceptación de términos por versión | 49 | `(user_id, version)` único |
| `customer_otp_attempts` | Límite de envíos de OTP | 49 | *deny-all*; solo la API |

### Catálogo
| Tabla | Para qué | Filas |
|---|---|---|
| `businesses` | Negocios (38 columnas): capacidades (`accepts_web_delivery/pickup`, `publishes_catalog`, `primary_capability`), `slug`, `accent_color`, `whatsapp_number`, `accepting_orders_until`, `is_active`, `is_blocked`, tarifas, ETA | 4 |
| `business_schedule` | Horario semanal (turnos 1 y 2) | 28 |
| `business_service_days` | **Apertura declarada** por día de servicio (una fila por `service_date`) | 125 |
| `business_payment_qrs` | Cuentas de cobro Yape/Plin y QR (con reserva) | — |
| `menu_categories` · `menu_items` · `menu_modifier_groups` · `menu_modifier_options` · `menu_item_modifier_groups` | Carta y modificadores; `menu_items` lleva `is_available`, `is_compact` («destacado»), franja (`available_days/from/to`), `deleted_at` | 18 · 129 · 68 · 274 · 76 |

### Pedidos
| Tabla | Para qué | Filas |
|---|---|---|
| **`orders`** | El agregado (**98 columnas**): identidad, negocio/motorizado/cliente, dirección y coordenadas, importes, pago, ~22 sellos de tiempo, cancelación, GPS del cliente, antifraude (`risk_flags`), efectivo | ~716 |
| `customer_order_items` · `customer_order_item_modifiers` | Líneas con **instantánea** de nombre y precio | 120 · 120 |
| `order_status_history` · `order_event_log` | Historia de estados y registro de eventos (inmutable) | 3 437 · 5 376 |
| `order_transfer_requests` · `order_assignment_rejections` | Traspasos y rechazos de asignación | — |
| `order_reviews` · `order_review_dismissals` | Reseñas (nota + etiquetas + texto) y «ahora no» | 21 reseñas |
| `promo_redemptions` | Uso de promos de envío gratis | — |

### Direcciones
| Tabla | Para qué | Filas |
|---|---|---|
| `customer_addresses` | Direcciones **del cliente** (etiqueta, línea, referencia, coordenadas, precisión, `is_default`) | 32 |
| `address_directory` | **Conocimiento del pueblo por teléfono** (ETL del v1, cajera, motorizado, admin) | 908 |
| `delivery_zones` · `map_landmarks` | Zonas de cobro (`near/far`) y puntos de interés (43) | — · 43 |

### Dinero y logística
| Tabla | Para qué |
|---|---|
| `business_charges` (1 292) | **Libro** de cargos al negocio (comisión, envío, devoluciones); `balance_due` derivado |
| `restaurant_payments` | Pagos de comisiones que hace el negocio |
| `cash_settlements` (228) | Efectivo del motorizado al negocio, **una por pedido** |
| `drivers` · `driver_availability` · `driver_restaurants` | Motorizados, disponibilidad y restaurantes asignados |

### Antifraude y casos
| Tabla | Para qué |
|---|---|
| `customer_strikes` · `customer_incidents` | Faltas y reportes de motorizados |
| `reports` | Casos: `no_show`, `rejected_proof_disputed`, `cash_difference`, `restaurant_fake`, `strike_reactivation`, `advance_dispute`, `prepay_refund_review` |
| `fraud_coverage_claims` | Reclamos de cobertura de fraude de negocios |
| `admin_alerts` | Alertas para el admin |

### Infraestructura
| Tabla | Para qué | Notas |
|---|---|---|
| `app_settings` | **21 claves** de parámetros operativos (JSON) | Ver `SYS-CFG` |
| `domain_events` (5 620) | Eventos de dominio para push | **0 marcados como publicados** |
| `outbox_events` | Outbox de apelaciones hacia Inngest | *deny-all* |
| `idempotency_keys` | Idempotencia (`key uuid`, caduca a 24 h) | *deny-all* |
| `push_subscriptions` (26) · `push_delivery_log` (~8 k) | Suscripciones Web Push y registro de envíos | Solo Web Push |

## Tipos enumerados (20)

`order_status` (12 valores) · `order_source` (`customer_pwa`, `business_manual`) · `delivery_method`
(`delivery`, `pickup`) · `payment_intent` (`prepaid`, `pending_yape`, `pending_cash`, `pending_mixed`) ·
`payment_real` (`paid_prepaid/yape/cash/mixed`, `unpaid`, `refunded`) · `payment_wallet` (`yape`, `plin`) ·
`distance_band` (`near`, `far`) · `cancel_reason` (8) · `user_role` (4) · `business_primary_capability`
(6: `drivers_only`, `catalog_pickup`, `catalog_delivery`, `catalog_full`, `pickup_local`, `catalog_only`) ·
`address_source` (4) · `incident_type` (7) · `report_type` (7) · `report_status` (3) · `fraud_claim_status` ·
`cash_settlement_status` (6) · `settlement_status` (4) · `transfer_request_status` (5) · `vehicle_type` (4) ·
`map_landmark_category` (10).

## Funciones (106) por dominio

Las 8 mayores concentran la lógica (`[DB-PROD]`, bytes de fuente):

| Función | B | Qué hace |
|---|---|---|
| `advance_order` | 38 996 | **Todas** las transiciones de estado de todos los roles |
| `create_customer_order` | 24 057 | Crea el pedido del cliente (17 rechazos de negocio) |
| `business_performance_metrics` | 13 096 | Métricas del panel de rendimiento |
| `validate_order` | 12 371 | Validación por llamada y de comprobantes |
| `update_business_manual_order` | 11 296 | Edición de un pedido manual |
| `admin_metrics` | 8 470 | Métricas del admin |
| `create_business_manual_order` | 8 467 | Pedido manual de la cajera |
| `admin_conversion_opportunity_stats` | 7 514 | Embudo de conversión |

Otras familias: **helpers de rol** (`current_user_has_role`, `current_business_id`, `current_driver_id`);
**antifraude** (`customer_contraentrega_decision`, `customer_requires_prepayment`,
`customer_gps_in_coverage`); **geografía** (`point_in_coverage_polygon`, `delivery_band_for_point`,
`point_in_ring`); **catálogo** (`search_catalog`, `f_unaccent`); **plazos** (`cancel_expired_prepay_orders`,
`expire_order`, `expire_order_transfers`, `enqueue_overdue_orders`, `enqueue_queued_orders`);
**dinero** (`generate_delivery_charges`, `settle_business_charges`, `deliver_order_cash`,
`confirm_order_cash`); **apelaciones** (`create_appeal_report`, `resolve_appeal`,
`register_appeal_refund`, `mark_appeal_in_review`); **reseñas** (`create_order_review`,
`get_pending_review`); **eventos** (`dispatch_event`, `claim_outbox_events`); **lectura pública**
(`get_tracking`, `get_order_intake_status`, `is_published_business`).

## Cómo se protege

- **RLS en las 45 tablas.** Patrón por tabla: `*_admin_all`, `*_owner_all` / `*_business_read`,
  `*_customer_read`, `*_driver_read`, `*_public_read` → **63 avisos de «políticas permisivas
  múltiples»** (`PER-06`); `orders` tiene 4 de lectura.
- **`SECURITY DEFINER` con `search_path` fijado** (88/88).
- **`GRANT` por columna** para el texto de las reseñas.
- **Storage:** carpetas por usuario en buckets privados; buckets públicos con tope de 3 MB.
- **Triggers en `orders` (9):** `touch_orders`, `trg_orders_balance_due`, `trg_orders_before_write`,
  `trg_orders_business_not_blocked`, `trg_orders_log_status`, `trg_orders_outbox_events`,
  `trg_orders_prepaid_refund`, `trg_orders_set_assigned_at`, `trg_promo_settle_redemption`.

## Cron (`pg_cron`, 11 jobs)

| Job | Frecuencia | Qué hace |
|---|---|---|
| `auto-cancel-prepay-timeout` | 1 min | `cancel_expired_prepay_orders()` (aceptación, validación, pago) |
| `expire-order-transfers` | 1 min | Vence traspasos |
| `flag-overdue-orders` | 1 min | Emite `OrderOverdue` (una vez) |
| `announce-queued-orders` | 1 min | Emite `OrderQueued` |
| `close-driver-shifts` | 15 min | Apaga disponibilidad fuera de horario |
| `prune-*` (6) | diario | Limpian suscripciones muertas, idempotencia, rechazos, `domain_events` (90 d), `push_delivery_log` (30 d), `outbox_events` (30 d) |

## Extensiones

`pg_cron`, `pg_net`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`,
`unaccent`, `uuid-ossp`. **Sin PostGIS**: la geografía es SQL propio (ray-casting).
