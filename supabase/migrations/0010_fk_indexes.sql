-- =============================================================================
-- 0010 · Índices de covering para FKs que se filtran/juntan (escalabilidad)
-- Solo los FK usados en policies RLS / joins / lookups. Los FK de pura auditoría
-- (*_by: resolved_by, changed_by, registered_by, paid_by, granted_by, operator,
-- cancelled_by, etc.) NO se indexan: nunca se filtran y el índice solo añadiría
-- costo de escritura. (Advisor unindexed_foreign_keys es INFO; esta es la
-- decisión correcta de ingeniería, no satisfacer ciegamente al linter.)
-- Idempotente.
-- =============================================================================

create index if not exists cs_driver_idx on public.cash_settlements (driver_id);
create index if not exists reports_business_idx on public.reports (business_id);
create index if not exists reports_driver_idx on public.reports (driver_id);
create index if not exists reports_customer_idx on public.reports (customer_user_id);
create index if not exists reports_order_idx on public.reports (order_id);
create index if not exists reports_created_by_idx on public.reports (created_by);
create index if not exists mmg_business_idx on public.menu_modifier_groups (business_id);
create index if not exists mimg_group_idx on public.menu_item_modifier_groups (group_id);
create index if not exists otr_from_driver_idx on public.order_transfer_requests (from_driver_id);
create index if not exists otr_to_driver_idx on public.order_transfer_requests (to_driver_id);
create index if not exists customer_strikes_user_idx on public.customer_strikes (customer_user_id);
create index if not exists customer_strikes_order_idx on public.customer_strikes (order_id);
create index if not exists rp_settlement_idx on public.restaurant_payments (settlement_id);
create index if not exists pdl_subscription_idx on public.push_delivery_log (subscription_id);
create index if not exists ca_customer_idx on public.contingency_advances (customer_user_id);
