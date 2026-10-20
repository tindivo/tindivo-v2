# Propiedad de los objetos de la base

> Verificado: 2026-10-12 · entorno: `develop@591ec569` (base local reconstruida desde `supabase/migrations`, hasta la `0260`)

Registro de DES-7: cada tabla, función, trigger y vista tiene un módulo dueño. Solo el dueño escribe en sus tablas; los demás leen por su interfaz (DB-18).

- La lista de objetos se genera desde el catálogo (`pg_class`, `pg_proc` y `pg_trigger`, esquema `public`); el módulo dueño se asigna a mano.
- Un objeto nuevo entra en el registro en el mismo PR que lo crea.
- `sin asignar` es válido mientras no exista el módulo dueño; se decide al crearlo. Los módulos aún no existen en el código: el nombre del dueño es el previsto en el mapa de módulos propuesto (`Docs/trabajo/arquitectura/04-arquitectura-objetivo.md` §3), y solo se asignó donde ese mapa no deja duda. `geo`, `fleet`, `trust`, `billing` y `reviews` quedan `sin asignar` a propósito: el mapa dice que antes hay que aclarar quién es dueño de qué.
- Los triggers heredan el dueño de su tabla. Las funciones solo tienen dueño cuando el nombre lo deja claro (Store y pedidos de Entregas); el resto, `sin asignar`.
- Total al 2026-10-20, medido en una base local con las migraciones hasta la 0270: 55 tablas, 0 vistas, 148 funciones (por nombre, sin las que pertenecen a extensiones) y 54 triggers. Las filas de la tabla dan las mismas cifras.

Discusión: `Docs/trabajo/arquitectura/04-arquitectura-objetivo.md`

| Objeto | Tipo | Módulo dueño | Notas |
|---|---|---|---|
| `address_directory` | tabla | sin asignar |  |
| `admin_alerts` | tabla | sin asignar |  |
| `app_settings` | tabla | platform |  |
| `business_charges` | tabla | sin asignar |  |
| `business_payment_qrs` | tabla | catalog |  |
| `business_schedule` | tabla | catalog |  |
| `business_service_days` | tabla | catalog |  |
| `businesses` | tabla | catalog |  |
| `cash_settlements` | tabla | sin asignar |  |
| `courier_order_events` | tabla | courier |  |
| `courier_orders` | tabla | courier |  |
| `creation_idempotency` | tabla | sin asignar |  |
| `customer_addresses` | tabla | geo | Libreta del cliente; decisión de Jesús, 2026-10-13. Excepción de escritura en el borrado de cuenta (`excepciones.md`) |
| `customer_incidents` | tabla | sin asignar |  |
| `customer_order_item_modifiers` | tabla | ordering |  |
| `customer_order_items` | tabla | ordering |  |
| `customer_otp_attempts` | tabla | identity |  |
| `customer_profiles` | tabla | identity |  |
| `customer_strikes` | tabla | sin asignar |  |
| `delivery_zones` | tabla | sin asignar |  |
| `directory_businesses` | tabla | sin asignar |  |
| `domain_events` | tabla | platform |  |
| `driver_availability` | tabla | sin asignar |  |
| `driver_restaurants` | tabla | sin asignar |  |
| `drivers` | tabla | sin asignar |  |
| `fraud_coverage_claims` | tabla | sin asignar |  |
| `idempotency_keys` | tabla | platform |  |
| `map_landmarks` | tabla | sin asignar |  |
| `menu_categories` | tabla | catalog |  |
| `menu_item_modifier_groups` | tabla | catalog |  |
| `menu_items` | tabla | catalog |  |
| `menu_modifier_groups` | tabla | catalog |  |
| `menu_modifier_options` | tabla | catalog |  |
| `ops_alert_throttle` | tabla | sin asignar | 0263; faltaba en el registro (errata del 2026-10-20) |
| `order_assignment_rejections` | tabla | sin asignar |  |
| `order_event_log` | tabla | ordering |  |
| `order_review_dismissals` | tabla | sin asignar |  |
| `order_reviews` | tabla | sin asignar |  |
| `order_status_history` | tabla | ordering |  |
| `order_transfer_requests` | tabla | sin asignar |  |
| `orders` | tabla | ordering |  |
| `outbox_events` | tabla | platform |  |
| `promo_redemptions` | tabla | promotions |  |
| `push_delivery_log` | tabla | notifications | 0270 añade `device_id` (FK a `push_devices`) y `channel` (`web`, `apns`, `fcm`) |
| `push_devices` | tabla | notifications | Tokens de APNs/FCM de las apps nativas (MV7a, 0268); solo servidor, nunca se devuelven |
| `push_subscriptions` | tabla | notifications |  |
| `reports` | tabla | sin asignar |  |
| `restaurant_payments` | tabla | sin asignar |  |
| `store_categories` | tabla | store |  |
| `store_events` | tabla | store |  |
| `store_product_images` | tabla | store |  |
| `store_products` | tabla | store |  |
| `terms_acceptance` | tabla | identity |  |
| `user_roles` | tabla | identity |  |
| `users` | tabla | identity |  |
| `users.proofs_purged_at` | columna | identity | 0269; marca la purga de comprobantes de una cuenta borrada |
| `app_settings.account_deletion` | ajuste | identity | 0269; `{"proofRetentionDays": 90}` (D-44); fila de `app_settings` (dueño de la tabla: platform) |
| `app_settings.push_devices_retention` | ajuste | notifications | 0270; `{"disabledDays": 30, "staleDays": 180}` (decisión de Jesús, 2026-10-20); fila de `app_settings` (dueño de la tabla: platform) |
| `account_deletion_blockers` | función | sin asignar |  |
| `admin_confirm_courier_remittance` | función | sin asignar |  |
| `admin_conversion_opportunity_stats` | función | sin asignar |  |
| `admin_correct_delivery_band` | función | sin asignar |  |
| `admin_metrics` | función | sin asignar |  |
| `admin_online_orders_stats` | función | sin asignar |  |
| `admin_promo_free_delivery_stats` | función | sin asignar |  |
| `advance_courier_order` | función | courier |  |
| `advance_order` | función | sin asignar |  |
| `apply_incident_strike` | función | sin asignar |  |
| `apply_order_transfer` | función | sin asignar |  |
| `block_business` | función | sin asignar |  |
| `broadcast_order_left_queue` | función | sin asignar |  |
| `business_performance_metrics` | función | sin asignar |  |
| `businesses_set_slug` | función | sin asignar |  |
| `cancel_customer_order` | función | sin asignar |  |
| `cancel_expired_prepay_orders` | función | sin asignar |  |
| `capture_delivery_address` | función | sin asignar |  |
| `cart_item_free_delivery` | función | sin asignar |  |
| `claim_ops_alert` | función | sin asignar | 0263; faltaba en el registro (errata del 2026-10-20) |
| `claim_outbox_events` | función | sin asignar |  |
| `claim_push_event` | función | sin asignar | 0264; faltaba en el registro (errata del 2026-10-20) |
| `close_drivers_outside_schedule` | función | sin asignar |  |
| `confirm_order_cash` | función | sin asignar |  |
| `courier_event_to_outbox` | función | courier |  |
| `courier_has_available_driver` | función | sin asignar |  |
| `courier_service_status` | función | sin asignar |  |
| `create_appeal_report` | función | sin asignar |  |
| `create_business_manual_order` | función | sin asignar |  |
| `create_courier_order` | función | courier |  |
| `create_customer_incident` | función | sin asignar |  |
| `create_customer_order` | función | sin asignar |  |
| `create_fallback_appeal_review` | función | sin asignar |  |
| `create_fraud_claim` | función | sin asignar |  |
| `create_order_idempotently` | función | sin asignar |  |
| `create_order_review` | función | sin asignar |  |
| `create_report_for_strike` | función | sin asignar |  |
| `current_business_id` | función | sin asignar |  |
| `current_customer_contraentrega_outcome` | función | sin asignar |  |
| `current_customer_promo_free_delivery` | función | sin asignar |  |
| `current_customer_trusted_for_contraentrega` | función | sin asignar |  |
| `current_driver_id` | función | sin asignar |  |
| `current_service_date` | función | sin asignar |  |
| `current_user_has_role` | función | sin asignar |  |
| `current_user_role` | función | sin asignar |  |
| `customer_address_delete` | función | sin asignar |  |
| `customer_address_save` | función | sin asignar |  |
| `customer_contraentrega_blocked` | función | sin asignar |  |
| `customer_contraentrega_decision` | función | sin asignar |  |
| `customer_gps_in_coverage` | función | sin asignar |  |
| `customer_is_blocked` | función | sin asignar |  |
| `customer_requires_prepayment` | función | sin asignar |  |
| `customer_trusted_for_contraentrega` | función | sin asignar |  |
| `delete_customer_account` | función | sin asignar |  |
| `deliver_order_cash` | función | sin asignar |  |
| `delivery_band_for_point` | función | sin asignar |  |
| `derive_business_primary_capability` | función | sin asignar |  |
| `dispatch_event` | función | sin asignar |  |
| `dispute_cash_settlement` | función | sin asignar |  |
| `driver_businesses` | función | sin asignar |  |
| `driver_courier_step` | función | sin asignar |  |
| `driver_remit_courier_fee` | función | sin asignar |  |
| `effective_max_change` | función | sin asignar |  |
| `enqueue_overdue_orders` | función | sin asignar |  |
| `enqueue_queued_orders` | función | sin asignar |  |
| `expire_courier_orders` | función | courier |  |
| `expire_order` | función | sin asignar |  |
| `expire_order_transfers` | función | sin asignar |  |
| `extend_order_prep` | función | sin asignar |  |
| `f_unaccent` | función | sin asignar |  |
| `finish_proof_purge` | función | identity | 0269; purga de comprobantes a los 90 días (D-44); solo `service_role` |
| `generate_courier_short_id` | función | courier |  |
| `generate_delivery_charges` | función | sin asignar |  |
| `generate_short_id` | función | sin asignar |  |
| `geo_distance_km` | función | sin asignar |  |
| `get_courier_tracking` | función | sin asignar |  |
| `get_order_intake_status` | función | sin asignar |  |
| `get_pending_review` | función | sin asignar |  |
| `get_tracking` | función | sin asignar |  |
| `handle_new_user` | función | sin asignar |  |
| `handle_orders_outbox_events` | función | sin asignar |  |
| `handle_prepaid_refund_on_cancel` | función | sin asignar |  |
| `is_published_business` | función | sin asignar |  |
| `is_within_courier_schedule` | función | sin asignar |  |
| `is_within_order_intake_window` | función | sin asignar |  |
| `is_within_platform_schedule` | función | sin asignar |  |
| `link_business_to_all_drivers` | función | sin asignar |  |
| `link_driver_to_all_businesses` | función | sin asignar |  |
| `list_proof_purge_due` | función | identity | 0269; solo `service_role` |
| `list_store_products` | función | store |  |
| `list_store_sold` | función | store |  |
| `list_user_proof_objects` | función | identity | 0269; solo `service_role` |
| `log_order_status_change` | función | sin asignar |  |
| `manual_order_money` | función | sin asignar |  |
| `mark_appeal_in_review` | función | sin asignar |  |
| `mark_pickup_notified` | función | sin asignar |  |
| `menu_item_free_delivery_day` | función | sin asignar |  |
| `menu_item_free_delivery_until` | función | sin asignar |  |
| `menu_item_in_window` | función | sin asignar |  |
| `menu_item_orderable_now` | función | sin asignar |  |
| `order_cash_owed` | función | sin asignar |  |
| `orders_before_write` | función | sin asignar |  |
| `orders_proof_immutable` | función | sin asignar |  |
| `orders_reject_if_business_blocked` | función | sin asignar |  |
| `pause_business_orders` | función | sin asignar |  |
| `personal_data_inventory` | función | sin asignar |  |
| `point_in_coverage_polygon` | función | sin asignar |  |
| `point_in_ring` | función | sin asignar |  |
| `promo_settle_redemption` | función | sin asignar |  |
| `proof_purge_precheck` | función | identity | 0269; comprueba antes de tocar Storage; solo `service_role` |
| `prune_creation_idempotency` | función | sin asignar |  |
| `prune_push_devices` | función | notifications | 0270; solo `service_role`; la llama el cron `prune-push-devices` (09:00 UTC) |
| `push_token_hash` | función | notifications | 0268; hash SHA-256 del token para su unicidad; solo `service_role` |
| `queue_lead_minutes` | función | sin asignar |  |
| `recalc_business_balance` | función | sin asignar |  |
| `redact_personal_json` | función | sin asignar |  |
| `refresh_customer_profile_risk` | función | sin asignar |  |
| `refresh_customer_risk_from_strike` | función | sin asignar |  |
| `register_appeal_refund` | función | sin asignar |  |
| `register_prepay_proof` | función | sin asignar |  |
| `register_push_device` | función | notifications | 0268; solo `service_role` |
| `reject_deleted_account` | función | sin asignar |  |
| `reorder_store_images` | función | store |  |
| `request_order_transfer` | función | sin asignar |  |
| `request_order_validation` | función | sin asignar |  |
| `resolve_appeal` | función | sin asignar |  |
| `resolve_cash_settlement` | función | sin asignar |  |
| `resolve_fraud_claim` | función | sin asignar |  |
| `respond_order_transfer` | función | sin asignar |  |
| `resume_business_orders` | función | sin asignar |  |
| `review_customer_incident` | función | sin asignar |  |
| `search_address_directory` | función | sin asignar |  |
| `search_catalog` | función | sin asignar |  |
| `set_driver_availability` | función | sin asignar |  |
| `settle_business_charges` | función | sin asignar |  |
| `slugify` | función | sin asignar |  |
| `store_event_counts` | función | store |  |
| `store_images_guard` | función | store |  |
| `store_make_slug` | función | store |  |
| `store_metrics` | función | store |  |
| `store_products_guard` | función | store |  |
| `touch_updated_at` | función | sin asignar |  |
| `unblock_business` | función | sin asignar |  |
| `unregister_push_device` | función | notifications | 0268; solo `service_role` |
| `update_assigned_at` | función | sin asignar |  |
| `update_business_manual_order` | función | sin asignar |  |
| `update_business_primary_capability` | función | sin asignar |  |
| `validate_order` | función | sin asignar |  |
| `address_directory.touch_address_directory` | trigger | sin asignar | en `address_directory` |
| `app_settings.touch_app_settings` | trigger | platform | en `app_settings` |
| `business_charges.trg_business_charges_recalc_balance` | trigger | sin asignar | en `business_charges` |
| `business_payment_qrs.touch_business_payment_qrs` | trigger | catalog | en `business_payment_qrs` |
| `business_schedule.touch_business_schedule` | trigger | catalog | en `business_schedule` |
| `businesses.businesses_slug_guard` | trigger | catalog | en `businesses` |
| `businesses.touch_businesses` | trigger | catalog | en `businesses` |
| `businesses.trg_businesses_derive_primary_capability` | trigger | catalog | en `businesses` |
| `businesses.trg_businesses_link_drivers` | trigger | catalog | en `businesses` |
| `cash_settlements.touch_cash_settlements` | trigger | sin asignar | en `cash_settlements` |
| `courier_order_events.courier_event_to_outbox` | trigger | courier | en `courier_order_events` |
| `courier_orders.touch_courier_orders` | trigger | courier | en `courier_orders` |
| `courier_orders.trg_reject_deleted_account` | trigger | courier | en `courier_orders` |
| `customer_addresses.touch_customer_addresses` | trigger | geo | en `customer_addresses` |
| `customer_addresses.trg_reject_deleted_account` | trigger | geo | en `customer_addresses` |
| `customer_incidents.trg_incident_apply_strike` | trigger | sin asignar | en `customer_incidents` |
| `customer_otp_attempts.trg_reject_deleted_account` | trigger | identity | en `customer_otp_attempts` |
| `customer_profiles.touch_customer_profiles` | trigger | identity | en `customer_profiles` |
| `customer_profiles.trg_reject_deleted_account` | trigger | identity | en `customer_profiles` |
| `customer_strikes.trg_customer_strikes_refresh_risk` | trigger | sin asignar | en `customer_strikes` |
| `customer_strikes.trg_strike_creates_report` | trigger | sin asignar | en `customer_strikes` |
| `delivery_zones.touch_delivery_zones` | trigger | sin asignar | en `delivery_zones` |
| `directory_businesses.touch_directory_businesses` | trigger | sin asignar | en `directory_businesses` |
| `domain_events.trg_dispatch_event` | trigger | platform | en `domain_events` |
| `driver_availability.touch_driver_availability` | trigger | sin asignar | en `driver_availability` |
| `drivers.touch_drivers` | trigger | sin asignar | en `drivers` |
| `drivers.trg_drivers_link_businesses` | trigger | sin asignar | en `drivers` |
| `map_landmarks.touch_map_landmarks` | trigger | sin asignar | en `map_landmarks` |
| `menu_categories.touch_menu_categories` | trigger | catalog | en `menu_categories` |
| `menu_items.touch_menu_items` | trigger | catalog | en `menu_items` |
| `menu_modifier_groups.touch_menu_modifier_groups` | trigger | catalog | en `menu_modifier_groups` |
| `order_review_dismissals.trg_reject_deleted_account` | trigger | sin asignar | en `order_review_dismissals` |
| `order_reviews.trg_reject_deleted_account` | trigger | sin asignar | en `order_reviews` |
| `orders.touch_orders` | trigger | ordering | en `orders` |
| `orders.trg_orders_balance_due` | trigger | ordering | en `orders` |
| `orders.trg_orders_before_write` | trigger | ordering | en `orders` |
| `orders.trg_orders_broadcast_left_queue` | trigger | ordering | en `orders` |
| `orders.trg_orders_business_not_blocked` | trigger | ordering | en `orders` |
| `orders.trg_orders_log_status` | trigger | ordering | en `orders` |
| `orders.trg_orders_outbox_events` | trigger | ordering | en `orders` |
| `orders.trg_orders_prepaid_refund` | trigger | ordering | en `orders` |
| `orders.trg_orders_proof_immutable` | trigger | ordering | en `orders` |
| `orders.trg_orders_set_assigned_at` | trigger | ordering | en `orders` |
| `orders.trg_promo_settle_redemption` | trigger | ordering | en `orders` |
| `orders.trg_reject_deleted_account` | trigger | ordering | en `orders` |
| `promo_redemptions.trg_reject_deleted_account` | trigger | promotions | en `promo_redemptions` |
| `push_devices.touch_push_devices` | trigger | notifications | en `push_devices` |
| `push_subscriptions.touch_push_subscriptions` | trigger | notifications | en `push_subscriptions` |
| `push_subscriptions.trg_reject_deleted_account` | trigger | notifications | en `push_subscriptions` |
| `reports.touch_reports` | trigger | sin asignar | en `reports` |
| `store_product_images.store_images_guard` | trigger | store | en `store_product_images` |
| `store_products.store_products_guard` | trigger | store | en `store_products` |
| `terms_acceptance.trg_reject_deleted_account` | trigger | identity | en `terms_acceptance` |
| `users.touch_users` | trigger | identity | en `users` |
