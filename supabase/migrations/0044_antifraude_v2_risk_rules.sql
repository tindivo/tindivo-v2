-- 0044_antifraude_v2_risk_rules.sql
-- Aligns the existing antifraud layer with SISTEMA_ANTIFRAUDE_TINDIVO v2,
-- excluding WhatsApp/OTP verification by current product decision.
--
-- Main changes:
-- - S/80 prepayment threshold.
-- - 2 confirmed strikes => prepayment only; 3 strikes => temporary block.
-- - Customer GPS validation is persisted and enforced server-side.
-- - Suspicious order patterns mark the order for manual validation.
-- - Manual business orders also honor strike-based risk rules.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value) values
  ('prepay_threshold', '80'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.app_settings (key, value) values
  ('location_validation', '{
    "centerLat": -9.1547,
    "centerLng": -78.5042,
    "normalRadiusKm": 10,
    "warningRadiusKm": 30,
    "maxAccuracyM": 500,
    "timeoutMs": 15000
  }'::jsonb)
on conflict (key) do update
  set value = public.app_settings.value || excluded.value,
      updated_at = now();

insert into public.app_settings (key, value) values
  ('strikes', '{
    "blockThreshold": 2,
    "prepaymentOnlyThreshold": 2,
    "temporaryBlockThreshold": 3,
    "temporaryBlockDays": 30
  }'::jsonb)
on conflict (key) do update
  set value = public.app_settings.value || excluded.value,
      updated_at = now();

insert into public.app_settings (key, value) values
  ('validation', '{
    "amountThreshold": 80,
    "maxValidationRequestsPerDayPerBusiness": 3,
    "samePhoneWindowMinutes": 30,
    "samePhoneThreshold": 3,
    "nearbyAddressWindowMinutes": 60,
    "nearbyAddressRadiusM": 200,
    "nearbyAddressThreshold": 3,
    "newPhoneHighTicketAmount": 50,
    "newPhoneHighTicketThreshold": 3,
    "spikeLookbackDays": 14,
    "spikeMultiplier": 2,
    "spikeMinimumOrdersPerHour": 6
  }'::jsonb)
on conflict (key) do update
  set value = public.app_settings.value || excluded.value,
      updated_at = now();

insert into public.app_settings (key, value) values
  ('fraud_coverage', '{
    "maxMonthlyCoverage": 200,
    "tindivoCoveragePercentage": 50
  }'::jsonb)
on conflict (key) do update
  set value = public.app_settings.value || excluded.value,
      updated_at = now();

-- Keep location_validation readable by the customer PWA without exposing secret settings.
drop policy if exists as_public_read on public.app_settings;
create policy as_public_read on public.app_settings for select to anon, authenticated
  using (key in (
    'platform_schedule',
    'support_phone',
    'support_whatsapp',
    'prepay_threshold',
    'delivery_bands',
    'coverage',
    'location_validation',
    'terms_version'
  ));

-- ---------------------------------------------------------------------------
-- 2. Orders: GPS and risk metadata
-- ---------------------------------------------------------------------------

alter table public.orders add column if not exists customer_gps_lat double precision;
alter table public.orders add column if not exists customer_gps_lng double precision;
alter table public.orders add column if not exists customer_gps_accuracy_m double precision;
alter table public.orders add column if not exists customer_gps_distance_to_center_km numeric(10,3);
alter table public.orders add column if not exists customer_gps_validated_at timestamptz;
alter table public.orders add column if not exists customer_gps_method text;
alter table public.orders add column if not exists risk_flags jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists validation_reason_code text;

alter table public.orders drop constraint if exists orders_customer_gps_method_check;
alter table public.orders add constraint orders_customer_gps_method_check
  check (
    customer_gps_method is null
    or customer_gps_method in ('gps_high_accuracy', 'gps_low_accuracy', 'manual_skip_prepaid', 'failed')
  );

create index if not exists orders_requires_validation_idx
  on public.orders (business_id, created_at desc) where requires_validation = true;
create index if not exists orders_risk_flags_gin_idx
  on public.orders using gin (risk_flags);
create index if not exists orders_customer_gps_distance_idx
  on public.orders (customer_gps_distance_to_center_km)
  where customer_gps_distance_to_center_km is not null;

-- ---------------------------------------------------------------------------
-- 3. Shared risk helpers
-- ---------------------------------------------------------------------------

create or replace function public.geo_distance_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
) returns double precision
language sql immutable set search_path = ''
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
    * power(sin(radians((p_lng2 - p_lng1) / 2)), 2)
  ));
$$;

create or replace function public.customer_contraentrega_blocked(p_phone text, p_reference text)
  returns boolean
  language sql stable security definer set search_path = ''
as $$
  select
    (p_phone is not null and (select count(*) from public.customer_strikes s where s.phone = p_phone) >= v.threshold)
    or (
      p_reference is not null
      and (select count(*) from public.customer_strikes s where s.delivery_reference = p_reference) >= v.threshold
    )
  from (
    select coalesce(
      (select (value ->> 'prepaymentOnlyThreshold')::int from public.app_settings where key = 'strikes'),
      (select (value ->> 'blockThreshold')::int from public.app_settings where key = 'strikes'),
      2
    ) as threshold
  ) v;
$$;

create or replace function public.customer_requires_prepayment(
  p_user_id uuid,
  p_phone text,
  p_reference text
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_threshold int;
begin
  select coalesce((value ->> 'prepaymentOnlyThreshold')::int, (value ->> 'blockThreshold')::int, 2)
    into v_threshold
  from public.app_settings
  where key = 'strikes';

  v_threshold := coalesce(v_threshold, 2);

  return (
    (p_user_id is not null and exists (
      select 1 from public.customer_profiles cp
      where cp.user_id = p_user_id and cp.contraentrega_blocked = true
    ))
    or (p_user_id is not null and (
      select count(*) from public.customer_strikes s where s.customer_user_id = p_user_id
    ) >= v_threshold)
    or (p_phone is not null and (
      select count(*) from public.customer_strikes s where s.phone = p_phone
    ) >= v_threshold)
    or (p_reference is not null and (
      select count(*) from public.customer_strikes s where s.delivery_reference = p_reference
    ) >= v_threshold)
  );
end;
$$;

create or replace function public.customer_is_blocked(p_user_id uuid, p_phone text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_threshold int;
  v_block_days int;
  v_profile_blocked boolean := false;
  v_phone_count int := 0;
  v_last_strike_at timestamptz;
begin
  select coalesce((value ->> 'temporaryBlockThreshold')::int, 3),
         coalesce((value ->> 'temporaryBlockDays')::int, 30)
    into v_threshold, v_block_days
  from public.app_settings
  where key = 'strikes';

  v_threshold := coalesce(v_threshold, 3);
  v_block_days := coalesce(v_block_days, 30);

  if p_user_id is not null then
    select coalesce(blocked_until > now(), false)
      into v_profile_blocked
    from public.customer_profiles
    where user_id = p_user_id;
    if coalesce(v_profile_blocked, false) then
      return true;
    end if;
  end if;

  if p_phone is not null then
    select count(*), max(created_at)
      into v_phone_count, v_last_strike_at
    from public.customer_strikes
    where phone = p_phone;

    if v_phone_count >= v_threshold
       and v_last_strike_at + (v_block_days || ' days')::interval > now() then
      return true;
    end if;
  end if;

  return false;
end;
$$;

create or replace function public.refresh_customer_profile_risk(p_user_id uuid, p_phone text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_prepay_threshold int;
  v_block_threshold int;
  v_block_days int;
  v_profile record;
  v_count int;
  v_last_strike_at timestamptz;
begin
  select coalesce((value ->> 'prepaymentOnlyThreshold')::int, (value ->> 'blockThreshold')::int, 2),
         coalesce((value ->> 'temporaryBlockThreshold')::int, 3),
         coalesce((value ->> 'temporaryBlockDays')::int, 30)
    into v_prepay_threshold, v_block_threshold, v_block_days
  from public.app_settings
  where key = 'strikes';

  v_prepay_threshold := coalesce(v_prepay_threshold, 2);
  v_block_threshold := coalesce(v_block_threshold, 3);
  v_block_days := coalesce(v_block_days, 30);

  for v_profile in
    select user_id, phone
    from public.customer_profiles
    where (p_user_id is not null and user_id = p_user_id)
       or (p_phone is not null and phone = p_phone)
  loop
    select count(*), max(created_at)
      into v_count, v_last_strike_at
    from public.customer_strikes s
    where s.customer_user_id = v_profile.user_id
       or (v_profile.phone is not null and s.phone = v_profile.phone);

    update public.customer_profiles
      set strikes = v_count,
          contraentrega_blocked = v_count >= v_prepay_threshold,
          blocked_until = case
            when v_count >= v_block_threshold and v_last_strike_at is not null
              then v_last_strike_at + (v_block_days || ' days')::interval
            else null
          end,
          updated_at = now()
    where user_id = v_profile.user_id;
  end loop;
end;
$$;

create or replace function public.refresh_customer_risk_from_strike()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_customer_profile_risk(old.customer_user_id, old.phone);
    return old;
  end if;

  perform public.refresh_customer_profile_risk(new.customer_user_id, new.phone);

  if tg_op = 'UPDATE' then
    if old.customer_user_id is distinct from new.customer_user_id or old.phone is distinct from new.phone then
      perform public.refresh_customer_profile_risk(old.customer_user_id, old.phone);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customer_strikes_refresh_risk on public.customer_strikes;
create trigger trg_customer_strikes_refresh_risk
  after insert or update or delete on public.customer_strikes
  for each row execute function public.refresh_customer_risk_from_strike();

-- Backfill profile risk from existing strikes.
do $$
declare
  r record;
begin
  for r in
    select distinct customer_user_id, phone
    from public.customer_strikes
  loop
    perform public.refresh_customer_profile_risk(r.customer_user_id, r.phone);
  end loop;
end $$;

revoke execute on function public.geo_distance_km(double precision, double precision, double precision, double precision) from anon, authenticated, public;
revoke execute on function public.customer_contraentrega_blocked(text, text) from public, anon, authenticated;
revoke execute on function public.customer_requires_prepayment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.customer_is_blocked(uuid, text) from public, anon, authenticated;
revoke execute on function public.refresh_customer_profile_risk(uuid, text) from public, anon, authenticated;
revoke execute on function public.refresh_customer_risk_from_strike() from public, anon, authenticated;
grant execute on function public.customer_contraentrega_blocked(text, text) to service_role;
grant execute on function public.customer_requires_prepayment(uuid, text, text) to service_role;
grant execute on function public.customer_is_blocked(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Customer order RPC: server-side GPS, prepayment, and pattern rules
-- ---------------------------------------------------------------------------

drop function if exists public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric);

create or replace function public.create_customer_order(
  p_customer_user_id uuid, p_business_id uuid, p_delivery_method delivery_method,
  p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb,
  p_delivery_address text default null, p_delivery_reference text default null,
  p_delivery_lat numeric default null, p_delivery_lng numeric default null,
  p_source order_source default 'customer_pwa'::order_source,
  p_client_pays_with numeric default null,
  p_customer_gps_lat double precision default null,
  p_customer_gps_lng double precision default null,
  p_customer_gps_accuracy_m double precision default null,
  p_customer_gps_distance_to_center_km numeric default null,
  p_customer_gps_method text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_business public.businesses;
  v_menu_item public.menu_items;
  v_item jsonb;
  v_qty int;
  v_unit numeric;
  v_line_total numeric;
  v_coi_id uuid;
  v_optid text;
  v_opt record;
  v_mods jsonb;
  v_mod jsonb;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_order_amount numeric := 0;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_threshold numeric;
  v_status public.order_status := 'pending_acceptance';
  v_vthreshold numeric;
  v_location jsonb;
  v_normal_radius numeric;
  v_warning_radius numeric;
  v_max_accuracy numeric;
  v_requires_validation boolean := false;
  v_validation_reason text;
  v_risk_flags jsonb := '{}'::jsonb;
  v_same_phone_count int;
  v_nearby_count int;
  v_new_high_ticket_count int;
  v_recent_hour_count int;
  v_avg_hourly numeric;
  v_same_phone_window int;
  v_same_phone_threshold int;
  v_nearby_window int;
  v_nearby_radius_m numeric;
  v_nearby_threshold int;
  v_high_ticket_amount numeric;
  v_high_ticket_threshold int;
  v_spike_days int;
  v_spike_multiplier numeric;
  v_spike_min int;
  v_night_start timestamptz;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;
  if not (v_business.is_active and not v_business.is_blocked and v_business.publishes_catalog) then
    raise exception 'Negocio no disponible' using errcode = 'P0001';
  end if;

  if public.customer_is_blocked(p_customer_user_id, p_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  if p_payment_intent <> 'prepaid'
     and public.customer_requires_prepayment(p_customer_user_id, p_customer_phone, p_delivery_reference) then
    raise exception 'Por politicas del servicio, este pedido requiere pago anticipado.'
      using errcode = 'P0001';
  end if;

  select value into v_location from public.app_settings where key = 'location_validation';
  v_normal_radius := coalesce((v_location ->> 'normalRadiusKm')::numeric, 10);
  v_warning_radius := coalesce((v_location ->> 'warningRadiusKm')::numeric, 30);
  v_max_accuracy := coalesce((v_location ->> 'maxAccuracyM')::numeric, 500);

  if p_delivery_method = 'delivery' then
    if p_customer_gps_method is null then
      raise exception 'Necesitamos validar tu ubicacion o continuar con pago anticipado.'
        using errcode = 'P0001';
    end if;

    if p_customer_gps_method in ('failed', 'manual_skip_prepaid') and p_payment_intent <> 'prepaid' then
      raise exception 'Si no podemos detectar tu ubicacion, este pedido requiere pago anticipado.'
        using errcode = 'P0001';
    end if;

    if p_customer_gps_accuracy_m is not null
       and p_customer_gps_accuracy_m > v_max_accuracy
       and p_payment_intent <> 'prepaid' then
      raise exception 'Tu ubicacion no fue suficientemente precisa. Reintenta o paga por adelantado.'
        using errcode = 'P0001';
    end if;

    if p_customer_gps_distance_to_center_km is not null then
      if p_customer_gps_distance_to_center_km > v_warning_radius and p_payment_intent <> 'prepaid' then
        raise exception 'Por politicas de servicio, este pedido requiere pago anticipado.'
          using errcode = 'P0001';
      elsif p_customer_gps_distance_to_center_km > v_normal_radius then
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'gps_warning_zone');
        v_risk_flags := v_risk_flags || jsonb_build_object('gpsWarningZone', true);
      end if;
    end if;

    if p_customer_gps_method in ('failed', 'manual_skip_prepaid') then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsFallbackPrepaid', true);
    elsif p_customer_gps_accuracy_m is not null and p_customer_gps_accuracy_m > v_max_accuracy then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsLowAccuracy', true);
    end if;
  end if;

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
  else
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m,
    customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method,
    order_amount, delivery_fee, status
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance'
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    for v_optid in select value from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb))
    loop
      select o.name as oname, o.additional_price as oprice, g.name as gname into v_opt
        from public.menu_modifier_options o
        join public.menu_modifier_groups g on g.id = o.group_id
        where o.id = v_optid::uuid and o.is_available
          and exists (
            select 1 from public.menu_item_modifier_groups mig
            where mig.item_id = v_menu_item.id and mig.group_id = o.group_id
          );
      if not found then raise exception 'Modificador no valido para este item' using errcode = 'P0001'; end if;
      v_unit := v_unit + v_opt.oprice;
      v_mods := v_mods || jsonb_build_object('g', v_opt.gname, 'n', v_opt.oname, 'p', v_opt.oprice);
    end loop;

    v_line_total := round(v_unit * v_qty, 2);
    v_order_amount := v_order_amount + v_line_total;

    insert into public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.base_price,
      v_qty, v_unit, v_line_total, nullif(v_item ->> 'note', '')
    ) returning id into v_coi_id;

    for v_mod in select * from jsonb_array_elements(v_mods)
    loop
      insert into public.customer_order_item_modifiers (
        item_id, group_name_snapshot, option_name_snapshot, additional_price_snapshot
      ) values (v_coi_id, v_mod ->> 'g', v_mod ->> 'n', (v_mod ->> 'p')::numeric);
    end loop;
  end loop;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount >= v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'Los pedidos de S/% a mas requieren pago anticipado con billetera digital', v_threshold
      using errcode = 'P0001';
  end if;

  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con el que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  select value into v_location from public.app_settings where key = 'validation';
  v_vthreshold := coalesce((v_location ->> 'amountThreshold')::numeric, 80);
  v_same_phone_window := coalesce((v_location ->> 'samePhoneWindowMinutes')::int, 30);
  v_same_phone_threshold := coalesce((v_location ->> 'samePhoneThreshold')::int, 3);
  v_nearby_window := coalesce((v_location ->> 'nearbyAddressWindowMinutes')::int, 60);
  v_nearby_radius_m := coalesce((v_location ->> 'nearbyAddressRadiusM')::numeric, 200);
  v_nearby_threshold := coalesce((v_location ->> 'nearbyAddressThreshold')::int, 3);
  v_high_ticket_amount := coalesce((v_location ->> 'newPhoneHighTicketAmount')::numeric, 50);
  v_high_ticket_threshold := coalesce((v_location ->> 'newPhoneHighTicketThreshold')::int, 3);
  v_spike_days := coalesce((v_location ->> 'spikeLookbackDays')::int, 14);
  v_spike_multiplier := coalesce((v_location ->> 'spikeMultiplier')::numeric, 2);
  v_spike_min := coalesce((v_location ->> 'spikeMinimumOrdersPerHour')::int, 6);

  select count(*) into v_same_phone_count
  from public.orders o
  where o.customer_phone = p_customer_phone
    and o.created_at >= now() - make_interval(mins => v_same_phone_window)
    and o.status <> 'cancelled';
  if v_same_phone_count >= v_same_phone_threshold then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'same_phone_burst');
    v_risk_flags := v_risk_flags || jsonb_build_object('samePhoneBurst', true);
  end if;

  if p_delivery_lat is not null and p_delivery_lng is not null then
    select count(*) into v_nearby_count
    from public.orders o
    where o.business_id = p_business_id
      and o.delivery_coordinates_lat is not null
      and o.delivery_coordinates_lng is not null
      and o.created_at >= now() - make_interval(mins => v_nearby_window)
      and o.status <> 'cancelled'
      and public.geo_distance_km(
        o.delivery_coordinates_lat::double precision,
        o.delivery_coordinates_lng::double precision,
        p_delivery_lat::double precision,
        p_delivery_lng::double precision
      ) <= (v_nearby_radius_m / 1000.0);
    if v_nearby_count >= v_nearby_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'nearby_address_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('nearbyAddressBurst', true);
    end if;
  end if;

  v_night_start := (date_trunc('day', now() at time zone 'America/Lima') + interval '18 hours') at time zone 'America/Lima';
  if now() < v_night_start then
    v_night_start := v_night_start - interval '1 day';
  end if;

  if v_order_amount >= v_high_ticket_amount then
    with nightly_orders as (
      select o.*
      from public.orders o
      where o.business_id = p_business_id
        and o.created_at >= v_night_start
        and o.order_amount >= v_high_ticket_amount
        and o.status <> 'cancelled'
        and o.customer_phone is not null
    ),
    new_phones as (
      select distinct no.customer_phone
      from nightly_orders no
      where not exists (
        select 1
        from public.orders prior
        where prior.customer_phone = no.customer_phone
          and prior.id <> no.id
          and prior.created_at < v_night_start
          and prior.status <> 'cancelled'
      )
    )
    select count(*) into v_new_high_ticket_count from new_phones;

    if v_new_high_ticket_count >= v_high_ticket_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'new_phone_high_ticket_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('newPhoneHighTicketBurst', true);
    end if;
  end if;

  select count(*) into v_recent_hour_count
  from public.orders o
  where o.business_id = p_business_id
    and o.created_at >= now() - interval '1 hour'
    and o.status <> 'cancelled';

  select avg(hour_count)::numeric into v_avg_hourly
  from (
    select date_trunc('hour', o.created_at) as bucket, count(*) as hour_count
    from public.orders o
    where o.business_id = p_business_id
      and o.created_at >= now() - make_interval(days => v_spike_days)
      and o.created_at < now() - interval '1 hour'
      and o.status <> 'cancelled'
    group by 1
  ) h;

  if v_recent_hour_count >= v_spike_min
     and v_avg_hourly is not null
     and v_recent_hour_count > (v_avg_hourly * v_spike_multiplier) then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'order_spike');
    v_risk_flags := v_risk_flags || jsonb_build_object('orderSpike', true);
    if not exists (
      select 1 from public.admin_alerts
      where type = 'fraud_order_spike'
        and created_at >= now() - interval '1 hour'
        and resolved_at is null
    ) then
      insert into public.admin_alerts (type, payload)
      values ('fraud_order_spike', jsonb_build_object(
        'businessId', p_business_id,
        'recentHourCount', v_recent_hour_count,
        'averageHourlyCount', v_avg_hourly,
        'orderId', v_order_id
      ));
    end if;
  end if;

  if p_payment_intent = 'prepaid' then
    v_status := 'validando';
  else
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = p_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = p_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'standard_validation_rule');
    end if;

    if v_requires_validation then
      v_status := 'validando';
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then greatest(0, round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2))
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method,
    'requiresValidation', v_requires_validation, 'riskFlags', v_risk_flags
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'cliente', p_customer_user_id,
    jsonb_build_object(
      'itemCount', jsonb_array_length(p_items),
      'status', v_status,
      'requiresValidation', v_requires_validation,
      'validationReasonCode', v_validation_reason,
      'riskFlags', v_risk_flags
    ));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', v_status, 'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee
  );
end;
$function$;

revoke execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Manual order RPC: strike rules apply to phone orders too.
-- ---------------------------------------------------------------------------

create or replace function public.create_business_manual_order(
  p_business_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_order_amount numeric,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_prep_time_minutes int default 20,
  p_delivery_reference text default null,
  p_notes text default null,
  p_client_pays_with numeric default null,
  p_yape_amount numeric default null,
  p_cash_amount numeric default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
begin
  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;
  if v_business.is_blocked then raise exception 'Tu cuenta esta suspendida' using errcode = 'P0001'; end if;
  if not v_business.is_active then raise exception 'Negocio inactivo' using errcode = 'P0001'; end if;
  if coalesce(p_order_amount, 0) <= 0 then raise exception 'Monto invalido' using errcode = 'P0001'; end if;

  if nullif(p_customer_phone, '') is not null
     and public.customer_is_blocked(null, nullif(p_customer_phone, '')) then
    raise exception 'Cliente temporalmente bloqueado por incidentes reiterados de entrega.'
      using errcode = 'P0001';
  end if;

  if p_payment_intent <> 'prepaid'
     and public.customer_requires_prepayment(null, nullif(p_customer_phone, ''), nullif(p_delivery_reference, '')) then
    raise exception 'Este cliente requiere pago anticipado por politicas del servicio.'
      using errcode = 'P0001';
  end if;

  v_prep := greatest(1, coalesce(p_prep_time_minutes, 20));

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
  else
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  end if;

  v_cash_part := case
    when p_payment_intent = 'pending_cash' then p_order_amount
    when p_payment_intent = 'pending_mixed' then coalesce(p_cash_amount, 0)
    else 0 end;
  v_change := case
    when p_client_pays_with is not null and v_cash_part > 0
      then greatest(0, round(p_client_pays_with - v_cash_part, 2))
    else null end;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, business_notes,
    prep_time_minutes, confirmed_at, preparing_at, estimated_ready_at,
    appears_in_queue_at, client_pays_with, change_to_give, yape_amount, cash_amount
  ) values (
    v_business.id, null, 'business_manual', p_delivery_method, p_payment_intent,
    nullif(p_customer_name, ''), nullif(p_customer_phone, ''), null, p_delivery_reference,
    p_order_amount, v_delivery_fee, 'preparing', p_notes,
    v_prep, now(), now(), now() + make_interval(mins => v_prep),
    now() + make_interval(mins => greatest(0, v_prep - 10)),
    p_client_pays_with, v_change,
    case when p_payment_intent = 'pending_mixed' then p_yape_amount else null end,
    case when p_payment_intent in ('pending_cash', 'pending_mixed') then v_cash_part else null end
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  insert into public.customer_order_items (
    order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
    quantity, unit_price, line_total, note
  ) values (
    v_order_id, null, 'Pedido por telefono', p_order_amount, 1, p_order_amount, p_order_amount, p_notes
  );

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id, 'manual', true,
    'orderAmount', p_order_amount, 'deliveryMethod', p_delivery_method, 'status', 'preparing'));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'business', p_business_user_id,
    jsonb_build_object('manual', true, 'prepMinutes', v_prep));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', 'preparing', 'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'total', p_order_amount + v_delivery_fee);
end;
$$;

revoke execute on function public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric) to service_role;
