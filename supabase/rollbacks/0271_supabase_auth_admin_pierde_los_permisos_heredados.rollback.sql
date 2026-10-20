-- ROLLBACK de la 0271 · devuelve a supabase_auth_admin los permisos heredados sobre public
--
-- Restaura EXACTAMENTE la lista medida en tindivo-prod el 2026-10-20 (37 tablas con todos los
-- privilegios, order_number_seq con SELECT/UPDATE/USAGE, EXECUTE en 59 funciones y USAGE del
-- esquema). Solo tiene sentido en prod: en una base hecha con las migraciones no existían.
-- Úsese solo si la 0271 rompe algo de Auth y mientras se corrige.

grant usage on schema public to supabase_auth_admin;

grant all on table public.admin_alerts to supabase_auth_admin;
grant all on table public.app_settings to supabase_auth_admin;
grant all on table public.business_charges to supabase_auth_admin;
grant all on table public.business_schedule to supabase_auth_admin;
grant all on table public.businesses to supabase_auth_admin;
grant all on table public.cash_settlements to supabase_auth_admin;
grant all on table public.customer_addresses to supabase_auth_admin;
grant all on table public.customer_incidents to supabase_auth_admin;
grant all on table public.customer_order_item_modifiers to supabase_auth_admin;
grant all on table public.customer_order_items to supabase_auth_admin;
grant all on table public.customer_otp_attempts to supabase_auth_admin;
grant all on table public.customer_profiles to supabase_auth_admin;
grant all on table public.customer_strikes to supabase_auth_admin;
grant all on table public.domain_events to supabase_auth_admin;
grant all on table public.driver_availability to supabase_auth_admin;
grant all on table public.driver_restaurants to supabase_auth_admin;
grant all on table public.drivers to supabase_auth_admin;
grant all on table public.fraud_coverage_claims to supabase_auth_admin;
grant all on table public.idempotency_keys to supabase_auth_admin;
grant all on table public.menu_categories to supabase_auth_admin;
grant all on table public.menu_item_modifier_groups to supabase_auth_admin;
grant all on table public.menu_items to supabase_auth_admin;
grant all on table public.menu_modifier_groups to supabase_auth_admin;
grant all on table public.menu_modifier_options to supabase_auth_admin;
grant all on table public.order_assignment_rejections to supabase_auth_admin;
grant all on table public.order_event_log to supabase_auth_admin;
grant all on table public.order_status_history to supabase_auth_admin;
grant all on table public.order_transfer_requests to supabase_auth_admin;
grant all on table public.orders to supabase_auth_admin;
grant all on table public.outbox_events to supabase_auth_admin;
grant all on table public.push_delivery_log to supabase_auth_admin;
grant all on table public.push_subscriptions to supabase_auth_admin;
grant all on table public.reports to supabase_auth_admin;
grant all on table public.restaurant_payments to supabase_auth_admin;
grant all on table public.terms_acceptance to supabase_auth_admin;
grant all on table public.user_roles to supabase_auth_admin;
grant all on table public.users to supabase_auth_admin;

grant select, update, usage on sequence public.order_number_seq to supabase_auth_admin;

grant execute on function public.admin_metrics(timestamp with time zone,timestamp with time zone) to supabase_auth_admin;
grant execute on function public.advance_order(uuid,uuid,public.user_role,text,jsonb) to supabase_auth_admin;
grant execute on function public.apply_incident_strike() to supabase_auth_admin;
grant execute on function public.cancel_customer_order(uuid,uuid) to supabase_auth_admin;
grant execute on function public.claim_outbox_events(integer) to supabase_auth_admin;
grant execute on function public.close_drivers_outside_schedule() to supabase_auth_admin;
grant execute on function public.create_appeal_report(uuid,text) to supabase_auth_admin;
grant execute on function public.create_customer_incident(uuid,public.incident_type,uuid,text,text) to supabase_auth_admin;
grant execute on function public.create_fallback_appeal_review(uuid) to supabase_auth_admin;
grant execute on function public.create_fraud_claim(uuid,uuid,numeric,text,text) to supabase_auth_admin;
grant execute on function public.create_report_for_strike() to supabase_auth_admin;
grant execute on function public.current_business_id() to supabase_auth_admin;
grant execute on function public.current_driver_id() to supabase_auth_admin;
grant execute on function public.current_user_has_role(public.user_role) to supabase_auth_admin;
grant execute on function public.current_user_role() to supabase_auth_admin;
grant execute on function public.customer_contraentrega_blocked(text,text) to supabase_auth_admin;
grant execute on function public.customer_is_blocked(uuid,text) to supabase_auth_admin;
grant execute on function public.customer_requires_prepayment(uuid,text,text) to supabase_auth_admin;
grant execute on function public.derive_business_primary_capability(boolean,boolean,boolean,boolean) to supabase_auth_admin;
grant execute on function public.dispatch_event() to supabase_auth_admin;
grant execute on function public.dispute_cash_settlement(uuid,uuid,numeric,text) to supabase_auth_admin;
grant execute on function public.expire_order(uuid,public.cancel_reason) to supabase_auth_admin;
grant execute on function public.expire_order_transfers() to supabase_auth_admin;
grant execute on function public.extend_order_prep(uuid,uuid) to supabase_auth_admin;
grant execute on function public.f_unaccent(text) to supabase_auth_admin;
grant execute on function public.generate_delivery_charges() to supabase_auth_admin;
grant execute on function public.generate_short_id() to supabase_auth_admin;
grant execute on function public.geo_distance_km(double precision,double precision,double precision,double precision) to supabase_auth_admin;
grant execute on function public.get_order_intake_status(timestamp with time zone) to supabase_auth_admin;
grant execute on function public.get_tracking(text) to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_orders_outbox_events() to supabase_auth_admin;
grant execute on function public.handle_prepaid_refund_on_cancel() to supabase_auth_admin;
grant execute on function public.is_published_business(uuid) to supabase_auth_admin;
grant execute on function public.is_within_order_intake_window(timestamp with time zone) to supabase_auth_admin;
grant execute on function public.is_within_platform_schedule() to supabase_auth_admin;
grant execute on function public.log_order_status_change() to supabase_auth_admin;
grant execute on function public.mark_appeal_in_review(uuid) to supabase_auth_admin;
grant execute on function public.orders_before_write() to supabase_auth_admin;
grant execute on function public.pause_business_orders(uuid,integer) to supabase_auth_admin;
grant execute on function public.point_in_coverage_polygon(numeric,numeric) to supabase_auth_admin;
grant execute on function public.refresh_customer_profile_risk(uuid,text) to supabase_auth_admin;
grant execute on function public.refresh_customer_risk_from_strike() to supabase_auth_admin;
grant execute on function public.register_appeal_refund(uuid,numeric,text,uuid) to supabase_auth_admin;
grant execute on function public.request_order_transfer(uuid,uuid,text) to supabase_auth_admin;
grant execute on function public.request_order_validation(uuid,uuid) to supabase_auth_admin;
grant execute on function public.resolve_appeal(uuid,text,text) to supabase_auth_admin;
grant execute on function public.resolve_cash_settlement(uuid,uuid,numeric,text) to supabase_auth_admin;
grant execute on function public.resolve_fraud_claim(uuid,uuid,boolean,text) to supabase_auth_admin;
grant execute on function public.respond_order_transfer(uuid,uuid,boolean) to supabase_auth_admin;
grant execute on function public.resume_business_orders(uuid) to supabase_auth_admin;
grant execute on function public.review_customer_incident(uuid,uuid,text) to supabase_auth_admin;
grant execute on function public.search_catalog(text,integer) to supabase_auth_admin;
grant execute on function public.set_driver_availability(uuid,boolean) to supabase_auth_admin;
grant execute on function public.settle_business_charges(uuid,uuid[],numeric,text,text,uuid) to supabase_auth_admin;
grant execute on function public.touch_updated_at() to supabase_auth_admin;
grant execute on function public.unblock_business(uuid,uuid) to supabase_auth_admin;
grant execute on function public.update_assigned_at() to supabase_auth_admin;
grant execute on function public.update_business_primary_capability() to supabase_auth_admin;
