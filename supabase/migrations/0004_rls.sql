-- =============================================================================
-- 0004 · Row Level Security (completa por tabla)
-- MODELO: service_role (apps/api + Edge Functions) hace BYPASS de RLS y es el
-- ÚNICO camino para mutaciones financieras / de estado de pedido / privilegios.
-- RLS gobierna el acceso DIRECTO desde el browser con la anon/publishable key:
--   - LECTURA: self / admin / participante / público (vía vistas y helpers).
--   - ESCRITURA directa permitida SOLO para datos self-scoped no sensibles
--     (perfil, direcciones, términos, push, disponibilidad, menú/horario del dueño).
-- Helpers envueltos en (select ...) para que el planner los evalúe una vez por
-- query (patrón anti auth_rls_initplan de Supabase → escala en tablas grandes).
-- Idempotente (DROP POLICY IF EXISTS + CREATE POLICY).
-- =============================================================================

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.businesses enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_availability enable row level security;
alter table public.driver_restaurants enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_strikes enable row level security;
alter table public.terms_acceptance enable row level security;
alter table public.business_schedule enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_event_log enable row level security;
alter table public.order_assignment_rejections enable row level security;
alter table public.order_transfer_requests enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifier_options enable row level security;
alter table public.menu_item_modifier_groups enable row level security;
alter table public.customer_order_items enable row level security;
alter table public.customer_order_item_modifiers enable row level security;
alter table public.settlements enable row level security;
alter table public.cash_settlements enable row level security;
alter table public.restaurant_payments enable row level security;
alter table public.contingency_advances enable row level security;
alter table public.reports enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;
alter table public.domain_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.admin_alerts enable row level security;
alter table public.app_settings enable row level security;

-- users (escritura vía API/trigger; el browser solo lee lo suyo)
drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select to authenticated using (id = (select auth.uid()));
drop policy if exists users_self_update on public.users;  -- removida: cambios de perfil/rol vía API

-- user_roles
drop policy if exists ur_admin_all on public.user_roles;
create policy ur_admin_all on public.user_roles for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists ur_self_read on public.user_roles;
create policy ur_self_read on public.user_roles for select to authenticated using (user_id = (select auth.uid()));

-- businesses (base: solo owner/admin; el público lee la vista businesses_public)
drop policy if exists biz_admin_all on public.businesses;
create policy biz_admin_all on public.businesses for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists biz_self_read on public.businesses;
create policy biz_self_read on public.businesses for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists biz_self_update on public.businesses;  -- removida: edición de negocio vía API
drop policy if exists biz_public_read on public.businesses;  -- removida: fuga de columnas → marketplace vía API
drop policy if exists biz_driver_read on public.businesses;  -- removida: el driver obtiene datos vía API

-- drivers
drop policy if exists drv_admin_all on public.drivers;
create policy drv_admin_all on public.drivers for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists drv_self_read on public.drivers;
create policy drv_self_read on public.drivers for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists drv_self_update on public.drivers;  -- removida: edición vía API

-- driver_availability (el driver alterna su propia disponibilidad — self-scoped, seguro)
drop policy if exists da_admin_all on public.driver_availability;
create policy da_admin_all on public.driver_availability for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists da_self_all on public.driver_availability;
create policy da_self_all on public.driver_availability for all to authenticated
  using (driver_id = (select public.current_driver_id())) with check (driver_id = (select public.current_driver_id()));

-- driver_restaurants
drop policy if exists dr_admin_all on public.driver_restaurants;
create policy dr_admin_all on public.driver_restaurants for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists dr_self_read on public.driver_restaurants;
create policy dr_self_read on public.driver_restaurants for select to authenticated
  using (driver_id = (select public.current_driver_id()));

-- customer_profiles (self; UPDATE restringido por columnas — no puede tocar strikes)
drop policy if exists cp_self_all on public.customer_profiles;
create policy cp_self_all on public.customer_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists cp_admin_read on public.customer_profiles;
create policy cp_admin_read on public.customer_profiles for select to authenticated
  using ((select public.current_user_has_role('admin')));
revoke update on public.customer_profiles from authenticated;
grant update (full_name, phone, default_address, default_reference, default_coordinates_lat, default_coordinates_lng, default_location_accuracy_m)
  on public.customer_profiles to authenticated;

-- customer_addresses (self-scoped, seguro)
drop policy if exists ca_self_all on public.customer_addresses;
create policy ca_self_all on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists ca_admin_read on public.customer_addresses;
create policy ca_admin_read on public.customer_addresses for select to authenticated
  using ((select public.current_user_has_role('admin')));

-- customer_strikes (admin lee; escritura solo service_role — anti-fraude)
drop policy if exists cstr_admin_all on public.customer_strikes;
create policy cstr_admin_all on public.customer_strikes for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));

-- terms_acceptance
drop policy if exists ta_self_all on public.terms_acceptance;
create policy ta_self_all on public.terms_acceptance for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists ta_admin_read on public.terms_acceptance;
create policy ta_admin_read on public.terms_acceptance for select to authenticated
  using ((select public.current_user_has_role('admin')));

-- business_schedule (owner edita el suyo; público lo lee vía helper)
drop policy if exists bs_admin_all on public.business_schedule;
create policy bs_admin_all on public.business_schedule for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists bs_owner_all on public.business_schedule;
create policy bs_owner_all on public.business_schedule for all to authenticated
  using (business_id = (select public.current_business_id())) with check (business_id = (select public.current_business_id()));
drop policy if exists bs_public_read on public.business_schedule;
create policy bs_public_read on public.business_schedule for select to anon, authenticated
  using (public.is_published_business(business_id));

-- orders (LECTURA por rol; TODA escritura vía service_role/API)
drop policy if exists ord_admin_all on public.orders;
create policy ord_admin_all on public.orders for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists ord_business_read on public.orders;
create policy ord_business_read on public.orders for select to authenticated
  using ((select public.current_user_has_role('business')) and business_id = (select public.current_business_id()));
drop policy if exists ord_driver_read on public.orders;
create policy ord_driver_read on public.orders for select to authenticated
  using (
    (select public.current_user_has_role('driver')) and (
      driver_id = (select public.current_driver_id())
      or (
        status = 'waiting_driver' and appears_in_queue_at <= now()
        and business_id in (select business_id from public.driver_restaurants where driver_id = (select public.current_driver_id()))
      )
    )
  );
drop policy if exists ord_customer_read on public.orders;
create policy ord_customer_read on public.orders for select to authenticated
  using (customer_user_id = (select auth.uid()));
drop policy if exists ord_business_update on public.orders;   -- removida: transiciones vía API
drop policy if exists ord_driver_update on public.orders;     -- removida: transiciones vía API
drop policy if exists ord_customer_insert on public.orders;   -- removida: creación vía API

-- order_status_history (lectura por participantes; escritura por trigger SECURITY DEFINER)
drop policy if exists osh_admin_read on public.order_status_history;
create policy osh_admin_read on public.order_status_history for select to authenticated
  using ((select public.current_user_has_role('admin')));
drop policy if exists osh_participant_read on public.order_status_history;
create policy osh_participant_read on public.order_status_history for select to authenticated
  using (order_id in (
    select id from public.orders
    where business_id = (select public.current_business_id())
       or driver_id = (select public.current_driver_id())
       or customer_user_id = (select auth.uid())
  ));

-- order_event_log (admin lee; escritura service_role)
drop policy if exists oel_admin_read on public.order_event_log;
create policy oel_admin_read on public.order_event_log for select to authenticated
  using ((select public.current_user_has_role('admin')));

-- order_assignment_rejections
drop policy if exists oar_admin_all on public.order_assignment_rejections;
create policy oar_admin_all on public.order_assignment_rejections for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists oar_driver_read on public.order_assignment_rejections;
create policy oar_driver_read on public.order_assignment_rejections for select to authenticated
  using (driver_id = (select public.current_driver_id()));

-- order_transfer_requests
drop policy if exists otr_admin_all on public.order_transfer_requests;
create policy otr_admin_all on public.order_transfer_requests for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists otr_driver_read on public.order_transfer_requests;
create policy otr_driver_read on public.order_transfer_requests for select to authenticated
  using (from_driver_id = (select public.current_driver_id()) or to_driver_id = (select public.current_driver_id()));

-- menú (lectura pública vía helper; el dueño edita el suyo directo — owner-scoped, seguro)
drop policy if exists mc_admin_all on public.menu_categories;
create policy mc_admin_all on public.menu_categories for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists mc_owner_all on public.menu_categories;
create policy mc_owner_all on public.menu_categories for all to authenticated
  using (business_id = (select public.current_business_id())) with check (business_id = (select public.current_business_id()));
drop policy if exists mc_public_read on public.menu_categories;
create policy mc_public_read on public.menu_categories for select to anon, authenticated
  using (is_active = true and public.is_published_business(business_id));

drop policy if exists mi_admin_all on public.menu_items;
create policy mi_admin_all on public.menu_items for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists mi_owner_all on public.menu_items;
create policy mi_owner_all on public.menu_items for all to authenticated
  using (business_id = (select public.current_business_id())) with check (business_id = (select public.current_business_id()));
drop policy if exists mi_public_read on public.menu_items;
create policy mi_public_read on public.menu_items for select to anon, authenticated
  using (public.is_published_business(business_id));

drop policy if exists mmg_admin_all on public.menu_modifier_groups;
create policy mmg_admin_all on public.menu_modifier_groups for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists mmg_owner_all on public.menu_modifier_groups;
create policy mmg_owner_all on public.menu_modifier_groups for all to authenticated
  using (business_id = (select public.current_business_id())) with check (business_id = (select public.current_business_id()));
drop policy if exists mmg_public_read on public.menu_modifier_groups;
create policy mmg_public_read on public.menu_modifier_groups for select to anon, authenticated
  using (public.is_published_business(business_id));

drop policy if exists mmo_admin_all on public.menu_modifier_options;
create policy mmo_admin_all on public.menu_modifier_options for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists mmo_owner_all on public.menu_modifier_options;
create policy mmo_owner_all on public.menu_modifier_options for all to authenticated
  using (group_id in (select id from public.menu_modifier_groups where business_id = (select public.current_business_id())))
  with check (group_id in (select id from public.menu_modifier_groups where business_id = (select public.current_business_id())));
drop policy if exists mmo_public_read on public.menu_modifier_options;
create policy mmo_public_read on public.menu_modifier_options for select to anon, authenticated
  using (group_id in (select id from public.menu_modifier_groups g where public.is_published_business(g.business_id)));

drop policy if exists mimg_admin_all on public.menu_item_modifier_groups;
create policy mimg_admin_all on public.menu_item_modifier_groups for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists mimg_owner_all on public.menu_item_modifier_groups;
create policy mimg_owner_all on public.menu_item_modifier_groups for all to authenticated
  using (item_id in (select id from public.menu_items where business_id = (select public.current_business_id())))
  with check (item_id in (select id from public.menu_items where business_id = (select public.current_business_id())));
drop policy if exists mimg_public_read on public.menu_item_modifier_groups;
create policy mimg_public_read on public.menu_item_modifier_groups for select to anon, authenticated
  using (item_id in (select id from public.menu_items mi where public.is_published_business(mi.business_id)));

-- customer_order_items + modifiers (lectura por participantes; escritura service_role)
drop policy if exists coi_admin_read on public.customer_order_items;
create policy coi_admin_read on public.customer_order_items for select to authenticated
  using ((select public.current_user_has_role('admin')));
drop policy if exists coi_participant_read on public.customer_order_items;
create policy coi_participant_read on public.customer_order_items for select to authenticated
  using (order_id in (
    select id from public.orders
    where business_id = (select public.current_business_id())
       or driver_id = (select public.current_driver_id())
       or customer_user_id = (select auth.uid())
  ));

drop policy if exists coim_admin_read on public.customer_order_item_modifiers;
create policy coim_admin_read on public.customer_order_item_modifiers for select to authenticated
  using ((select public.current_user_has_role('admin')));
drop policy if exists coim_participant_read on public.customer_order_item_modifiers;
create policy coim_participant_read on public.customer_order_item_modifiers for select to authenticated
  using (item_id in (
    select coi.id from public.customer_order_items coi
    join public.orders o on o.id = coi.order_id
    where o.business_id = (select public.current_business_id())
       or o.driver_id = (select public.current_driver_id())
       or o.customer_user_id = (select auth.uid())
  ));

-- billing (lectura por dueño/participante; escritura service_role/admin)
drop policy if exists stl_admin_all on public.settlements;
create policy stl_admin_all on public.settlements for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists stl_business_read on public.settlements;
create policy stl_business_read on public.settlements for select to authenticated
  using (business_id = (select public.current_business_id()));

drop policy if exists cs_admin_all on public.cash_settlements;
create policy cs_admin_all on public.cash_settlements for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists cs_business_read on public.cash_settlements;
create policy cs_business_read on public.cash_settlements for select to authenticated
  using (business_id = (select public.current_business_id()));
drop policy if exists cs_driver_read on public.cash_settlements;
create policy cs_driver_read on public.cash_settlements for select to authenticated
  using (driver_id = (select public.current_driver_id()));

drop policy if exists rp_admin_all on public.restaurant_payments;
create policy rp_admin_all on public.restaurant_payments for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists rp_business_read on public.restaurant_payments;
create policy rp_business_read on public.restaurant_payments for select to authenticated
  using (business_id = (select public.current_business_id()));

drop policy if exists ca_admin_all on public.contingency_advances;
create policy ca_admin_all on public.contingency_advances for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists ca_business_read on public.contingency_advances;
create policy ca_business_read on public.contingency_advances for select to authenticated
  using (order_id in (select id from public.orders where business_id = (select public.current_business_id())));

-- reports (bandeja admin; participantes leen lo suyo; insert con coherencia)
drop policy if exists rep_admin_all on public.reports;
create policy rep_admin_all on public.reports for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists rep_insert_auth on public.reports;
create policy rep_insert_auth on public.reports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (customer_user_id is null or customer_user_id = (select auth.uid()))
    and (business_id is null or business_id = (select public.current_business_id()))
    and (driver_id is null or driver_id = (select public.current_driver_id()))
  );
drop policy if exists rep_participant_read on public.reports;
create policy rep_participant_read on public.reports for select to authenticated
  using (
    created_by = (select auth.uid())
    or customer_user_id = (select auth.uid())
    or business_id = (select public.current_business_id())
    or driver_id = (select public.current_driver_id())
  );

-- push_subscriptions (self) / push_delivery_log (admin lee)
drop policy if exists ps_self_all on public.push_subscriptions;
create policy ps_self_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists ps_admin_read on public.push_subscriptions;
create policy ps_admin_read on public.push_subscriptions for select to authenticated
  using ((select public.current_user_has_role('admin')));

drop policy if exists pdl_admin_read on public.push_delivery_log;
create policy pdl_admin_read on public.push_delivery_log for select to authenticated
  using ((select public.current_user_has_role('admin')));

-- domain_events (admin lee; escritura service_role)
drop policy if exists de_admin_read on public.domain_events;
create policy de_admin_read on public.domain_events for select to authenticated
  using ((select public.current_user_has_role('admin')));

-- idempotency_keys: SIN policies -> solo service_role (deny a authenticated/anon).

-- admin_alerts
drop policy if exists aa_admin_all on public.admin_alerts;
create policy aa_admin_all on public.admin_alerts for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));

-- app_settings (admin escribe; lectura pública de un whitelist SIN secretos ni 'commissions')
drop policy if exists as_admin_all on public.app_settings;
create policy as_admin_all on public.app_settings for all to authenticated
  using ((select public.current_user_has_role('admin'))) with check ((select public.current_user_has_role('admin')));
drop policy if exists as_public_read on public.app_settings;
create policy as_public_read on public.app_settings for select to anon, authenticated
  using (key in ('platform_schedule', 'support_phone', 'support_whatsapp', 'prepay_threshold', 'delivery_bands', 'coverage', 'terms_version'));
