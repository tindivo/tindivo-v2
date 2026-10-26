-- =============================================================================
-- 0277 · Un número verificado, una sola cuenta; el traslado lo hace el cliente.
-- El SMS solo autoriza reclamar el número, nunca acceder a la cuenta anterior.
-- No se trasladan pedidos, roles, deudas, promociones ni datos personales.
-- =============================================================================

-- 1 · Historial independiente del perfil. 0259 conserva public.users como lápida.
create table if not exists public.phone_assignments (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[+]519[0-9]{8}$'),
  user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  start_reason text not null check (start_reason in ('backfill', 'verification', 'self_transfer')),
  ended_at timestamptz,
  end_reason text check (end_reason in ('self_transfer', 'replaced', 'duplicate_cleared', 'account_deleted')),
  check ((ended_at is null) = (end_reason is null)),
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists phone_assignments_open_phone on public.phone_assignments(phone) where ended_at is null;
create unique index if not exists phone_assignments_open_user on public.phone_assignments(user_id) where ended_at is null;
create index if not exists phone_assignments_history on public.phone_assignments(phone, user_id);

-- Antes de registrar historia o imponer el CHECK, falla con un mensaje entendible.
do $$
begin
  if exists (select 1 from public.customer_profiles where phone_verified_at is not null and phone !~ '^[+]519[0-9]{8}$')
     or exists (select 1 from public.customer_profiles where phone_verified_at is not null and phone is null) then
    raise exception '0277: hay teléfonos verificados fuera de E.164 peruano o sin teléfono; corregir antes de migrar';
  end if;
end;
$$;

-- No elegimos un ganador entre duplicados: todos deben volver a verificar.
do $$
declare
  v_numbers int;
  v_profiles int;
begin
  select count(*) into v_numbers from (
    select phone from public.customer_profiles where phone_verified_at is not null
    group by phone having count(*) > 1
  ) d;
  with duplicated as (
    select phone from public.customer_profiles where phone_verified_at is not null
    group by phone having count(*) > 1
  ), recorded as (
    insert into public.phone_assignments(phone, user_id, started_at, start_reason, ended_at, end_reason)
    select cp.phone, cp.user_id, cp.phone_verified_at, 'backfill', now(), 'duplicate_cleared'
    from public.customer_profiles cp join duplicated d on d.phone = cp.phone
    where cp.phone_verified_at is not null
    returning user_id
  )
  update public.customer_profiles cp set phone_verified_at = null
  where cp.user_id in (select user_id from recorded);
  get diagnostics v_profiles = row_count;
  raise notice '0277: % números duplicados; % perfiles desverificados', v_numbers, v_profiles;
end;
$$;

insert into public.phone_assignments(phone, user_id, started_at, start_reason)
select phone, user_id, phone_verified_at, 'backfill' from public.customer_profiles
where phone_verified_at is not null
on conflict do nothing;

create unique index if not exists customer_profiles_verified_phone_unique
  on public.customer_profiles(phone) where phone_verified_at is not null;
alter table public.customer_profiles drop constraint if exists customer_profiles_phone_e164;
alter table public.customer_profiles add constraint customer_profiles_phone_e164
  check (phone_verified_at is null or (phone is not null and phone ~ '^[+]519[0-9]{8}$'));

create table if not exists public.phone_transfer_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  phone text not null check (phone ~ '^[+]519[0-9]{8}$'),
  assignment_id uuid not null references public.phone_assignments(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  -- Liga el reintento a la asignación exacta que produjo, aunque el número salga
  -- de B y después vuelva a B.
  result_assignment_id uuid references public.phone_assignments(id),
  check ((consumed_at is null) = (result_assignment_id is null)),
  check (expires_at > created_at)
);
create index if not exists phone_transfer_challenges_user on public.phone_transfer_challenges(user_id);

create table if not exists public.phone_restrictions (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^9[0-9]{8}$'),
  kind text not null check (kind in ('blocked', 'contraentrega_blocked')),
  "until" timestamptz,
  source_user_id uuid references public.users(id),
  source text not null check (source = 'transfer'),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.users(id),
  lift_reason text
);
create index if not exists phone_restrictions_effective on public.phone_restrictions(phone, kind) where lifted_at is null;

create table if not exists public.customer_security_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  kind text not null check (kind = 'phone_moved'),
  phone_last3 text not null check (phone_last3 ~ '^[0-9]{3}$'),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists customer_security_notices_unseen on public.customer_security_notices(user_id, created_at) where seen_at is null;

alter table public.phone_assignments enable row level security;
alter table public.phone_transfer_challenges enable row level security;
alter table public.phone_restrictions enable row level security;
alter table public.customer_security_notices enable row level security;
drop policy if exists pa_admin_read on public.phone_assignments;
create policy pa_admin_read on public.phone_assignments for select to authenticated using ((select public.current_user_has_role('admin')));
drop policy if exists ptc_service_only on public.phone_transfer_challenges;
create policy ptc_service_only on public.phone_transfer_challenges for all to service_role using (true) with check (true);
drop policy if exists pr_admin_read on public.phone_restrictions;
create policy pr_admin_read on public.phone_restrictions for select to authenticated using ((select public.current_user_has_role('admin')));
drop policy if exists csn_self_read on public.customer_security_notices;
create policy csn_self_read on public.customer_security_notices for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.phone_assignments, public.phone_transfer_challenges,
  public.phone_restrictions, public.customer_security_notices from public, anon, authenticated;
grant select on public.phone_assignments, public.phone_restrictions, public.customer_security_notices to authenticated;
grant all on public.phone_assignments, public.phone_transfer_challenges,
  public.phone_restrictions, public.customer_security_notices to service_role;

-- 2 · La API solo llega aquí después de comprobar el SMS (o el simulacro local).
create or replace function public.claim_customer_phone(p_user_id uuid, p_phone text, p_challenge_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner public.phone_assignments%rowtype;
  v_sealed_user uuid;
  v_previous public.phone_assignments%rowtype;
  v_challenge public.phone_transfer_challenges%rowtype;
  v_customer public.customer_profiles%rowtype;
  v_source public.customer_profiles%rowtype;
  v_assignment_id uuid;
  v_notice_id uuid;
  v_blockers jsonb;
begin
  if p_phone is null or p_phone !~ '^[+]519[0-9]{8}$' then
    raise exception 'El número debe estar en E.164 peruano' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('customer_phone:' || p_phone));
  select * into v_owner from public.phone_assignments where phone = p_phone and ended_at is null;
  -- Un perfil sellado fuera de esta RPC (seeds, fixtures) no tiene asignación, pero
  -- el índice único dice que es el dueño: se bloquea con él y se registra abajo.
  select cp.user_id into v_sealed_user from public.customer_profiles cp
  where cp.phone = p_phone and cp.phone_verified_at is not null and cp.user_id <> p_user_id;

  -- Orden estable entre dos traslados cruzados; users antes que perfiles, como 0259.
  perform 1 from public.users where id in (p_user_id, v_owner.user_id, v_sealed_user) order by id for share;
  perform 1 from public.customer_profiles where user_id in (p_user_id, v_owner.user_id, v_sealed_user)
    order by user_id for update;
  -- A pudo sustituir este número mientras esperábamos su perfil. Volvemos a leer
  -- la versión abierta bajo el bloqueo antes de validar cualquier desafío.
  select * into v_owner from public.phone_assignments where phone = p_phone and ended_at is null;
  if v_owner.id is null and v_sealed_user is not null and exists (
    select 1 from public.customer_profiles cp
    where cp.user_id = v_sealed_user and cp.phone = p_phone and cp.phone_verified_at is not null
  ) then
    update public.phone_assignments set ended_at = now(), end_reason = 'replaced'
    where user_id = v_sealed_user and ended_at is null;
    insert into public.phone_assignments(phone, user_id, started_at, start_reason)
    select p_phone, cp.user_id, cp.phone_verified_at, 'verification'
    from public.customer_profiles cp where cp.user_id = v_sealed_user
    returning * into v_owner;
  end if;
  -- Si A borró su cuenta (0259 deja la lápida en users y borra el perfil), su
  -- asignación ya no protege a nadie: se cierra y el número queda libre. La
  -- historia sigue ahí, así que la confianza de quien lo tome empieza de cero (§4).
  if v_owner.id is not null and v_owner.user_id <> p_user_id and (
    exists (select 1 from public.users u where u.id = v_owner.user_id and u.deleted_at is not null)
    or not exists (select 1 from public.customer_profiles cp where cp.user_id = v_owner.user_id)
  ) then
    update public.phone_assignments set ended_at = now(), end_reason = 'account_deleted' where id = v_owner.id;
    update public.customer_profiles set phone_verified_at = null where user_id = v_owner.user_id;
    v_owner := null;
  end if;
  select * into v_customer from public.customer_profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'profile_missing');
  end if;
  select * into v_previous from public.phone_assignments where user_id = p_user_id and ended_at is null;

  -- Se valida ANTES del atajo de número ya propio: un desafío viejo no verifica.
  if p_challenge_id is not null then
    select * into v_challenge from public.phone_transfer_challenges where id = p_challenge_id for update;
    if not found or v_challenge.user_id <> p_user_id or v_challenge.phone <> p_phone then
      return jsonb_build_object('status', 'challenge_invalid');
    end if;
    if v_challenge.consumed_at is not null then
      if v_owner.id = v_challenge.result_assignment_id and v_owner.user_id = p_user_id
         and v_customer.phone = p_phone and v_customer.phone_verified_at is not null then
        return jsonb_build_object('status', 'transferred');
      end if;
      return jsonb_build_object('status', 'challenge_invalid');
    end if;
    if v_challenge.expires_at <= clock_timestamp() or v_owner.id is null
       or v_challenge.assignment_id <> v_owner.id or v_owner.user_id = p_user_id then
      return jsonb_build_object('status', 'challenge_invalid');
    end if;
  end if;

  if v_owner.id is null or v_owner.user_id = p_user_id then
    if v_customer.phone = p_phone and v_customer.phone_verified_at is not null then
      -- Sellado fuera de esta RPC (seeds, fixtures): el índice único ya garantiza
      -- que nadie más lo tiene verificado, así que solo falta registrar su asignación.
      if v_owner.id is null then
        update public.phone_assignments set ended_at = now(), end_reason = 'replaced'
        where id = v_previous.id and ended_at is null;
        insert into public.phone_assignments(phone, user_id, started_at, start_reason)
        values (p_phone, p_user_id, v_customer.phone_verified_at, 'verification');
      end if;
      return jsonb_build_object('status', 'verified');
    end if;
  elsif p_challenge_id is null then
    insert into public.phone_transfer_challenges(user_id, phone, assignment_id)
    values (p_user_id, p_phone, v_owner.id) returning * into v_challenge;
    return jsonb_build_object('status', 'transfer_required', 'challengeId', v_challenge.id, 'expiresAt', v_challenge.expires_at);
  end if;

  -- 0259 ya centraliza las dos guardas; los otros motivos de borrado no aplican.
  if v_customer.phone_verified_at is not null and v_customer.phone is distinct from p_phone then
    v_blockers := public.account_deletion_blockers(p_user_id);
    if (v_blockers ->> 'activeOrders')::int > 0 or (v_blockers ->> 'activeCourierOrders')::int > 0 then
      return jsonb_build_object('status', 'wait_active');
    end if;
  end if;

  if v_owner.user_id is not null and v_owner.user_id <> p_user_id then
    v_blockers := public.account_deletion_blockers(v_owner.user_id);
    if (v_blockers ->> 'activeOrders')::int > 0 or (v_blockers ->> 'activeCourierOrders')::int > 0 then
      return jsonb_build_object('status', 'wait_active');
    end if;
    select * into v_source from public.customer_profiles where user_id = v_owner.user_id;
    -- La cuenta borrada ya se trató arriba; cualquier otro desajuste entre la
    -- asignación y el perfil falla cerrado: no se adivinan sus sanciones.
    if not found or v_source.phone is distinct from p_phone or v_source.phone_verified_at is null then
      return jsonb_build_object('status', 'challenge_invalid');
    end if;
    if v_source.blocked_until > now() then
      insert into public.phone_restrictions(phone, kind, "until", source_user_id, source)
      values (regexp_replace(p_phone, '^[+]51', ''), 'blocked', v_source.blocked_until, v_source.user_id, 'transfer');
    end if;
    if v_source.contraentrega_blocked then
      insert into public.phone_restrictions(phone, kind, source_user_id, source)
      values (regexp_replace(p_phone, '^[+]51', ''), 'contraentrega_blocked', v_source.user_id, 'transfer');
    end if;
    update public.customer_profiles set phone_verified_at = null where user_id = v_owner.user_id;
    update public.phone_assignments set ended_at = now(), end_reason = 'self_transfer' where id = v_owner.id;
  end if;

  update public.phone_assignments set ended_at = now(), end_reason = 'replaced'
  where id = v_previous.id and ended_at is null;
  update public.customer_profiles set phone = p_phone, phone_verified_at = now() where user_id = p_user_id;
  insert into public.phone_assignments(phone, user_id, start_reason)
  values (p_phone, p_user_id, case when p_challenge_id is null then 'verification' else 'self_transfer' end)
  returning id into v_assignment_id;

  if p_challenge_id is not null then
    update public.phone_transfer_challenges set consumed_at = now(), result_assignment_id = v_assignment_id where id = p_challenge_id;
    insert into public.customer_security_notices(user_id, kind, phone_last3)
    values (v_owner.user_id, 'phone_moved', right(p_phone, 3)) returning id into v_notice_id;
    insert into public.domain_events(aggregate_type, aggregate_id, event_type, payload)
    values ('customer_security_notice', v_notice_id, 'CustomerPhoneMoved', jsonb_build_object('userId', v_owner.user_id));
    return jsonb_build_object('status', 'transferred');
  end if;
  return jsonb_build_object('status', 'verified');
end;
$$;
revoke execute on function public.claim_customer_phone(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_customer_phone(uuid, text, uuid) to service_role;

-- 3 · Riesgo anterior intacto; además, restricciones vigentes del número.
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
  -- El riesgo acompaña al número también en los pedidos de la cajera.
  if exists (
    select 1 from public.phone_restrictions r
    where r.phone = regexp_replace(p_phone, '^[+]51', '')
      and r.kind in ('blocked') and r.lifted_at is null
      and (r."until" is null or r."until" > now())
  ) then
    return true;
  end if;
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
revoke execute on function public.customer_is_blocked(uuid, text) from public, anon, authenticated;
grant execute on function public.customer_is_blocked(uuid, text) to service_role;

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
  -- El riesgo acompaña al número también en los pedidos de la cajera.
  if exists (
    select 1 from public.phone_restrictions r
    where r.phone = regexp_replace(p_phone, '^[+]51', '')
      and r.kind in ('blocked', 'contraentrega_blocked') and r.lifted_at is null
      and (r."until" is null or r."until" > now())
  ) then
    return true;
  end if;
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
revoke execute on function public.customer_requires_prepayment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.customer_requires_prepayment(uuid, text, text) to service_role;

-- 4 · El riesgo va primero; sin otro dueño se conservan las tres reglas.
CREATE OR REPLACE FUNCTION public.customer_contraentrega_decision(p_customer_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
declare
  v_phone text;
begin
  if p_customer_user_id is null then
    return 'no_history';
  end if;

  -- El teléfono sale del PERFIL VERIFICADO, nunca de un parámetro. Ver 0171.
  select right(regexp_replace(cp.phone, '\D', '', 'g'), 9)
    into v_phone
  from public.customer_profiles cp
  where cp.user_id = p_customer_user_id
    and cp.phone_verified_at is not null;

  if v_phone is not null and v_phone !~ '^9\d{8}$' then
    v_phone := null;
  end if;

  -- EL RIESGO MANDA SOBRE CUALQUIER HISTORIAL, y sobre el GPS también: un
  -- 'risk_blocked' aquí NUNCA se convierte en 'no_history' aguas abajo, así
  -- que el guard de GPS de 0211 jamás lo toca. Ver 0171/0182.
  if public.customer_requires_prepayment(p_customer_user_id, v_phone, null) then
    return 'risk_blocked';
  end if;

  -- Un número con otro dueño solo gana confianza durante la asignación actual.
  if v_phone is not null and exists (
    select 1 from public.phone_assignments a
    where a.phone = '+51' || v_phone and a.user_id <> p_customer_user_id
  ) then
    if exists (
      select 1 from public.phone_assignments a join public.orders o
        on o.customer_user_id = a.user_id and o.customer_phone = v_phone
       and o.status = 'delivered' and o.created_at >= a.started_at
      where a.phone = '+51' || v_phone and a.user_id = p_customer_user_id and a.ended_at is null
    ) then
      return 'trusted';
    end if;
    return 'no_history';
  end if;

  -- (1) Historial de ESTA cuenta.
  if exists (
    select 1 from public.orders o
    where o.customer_user_id = p_customer_user_id
      and o.status = 'delivered'
  ) then
    return 'trusted';
  end if;

  if v_phone is null then
    return 'no_history';
  end if;

  -- (2) Entregas del teléfono en v2 (incluye manuales de la cajera).
  if exists (
    select 1 from public.orders o
    where o.customer_phone = v_phone
      and o.status = 'delivered'
  ) then
    return 'trusted';
  end if;

  -- (3) Cualquier fila del directorio para este teléfono (0182: sin exigir
  --     `legacy_address_id`).
  if exists (
    select 1 from public.address_directory ad
    where ad.phone = v_phone
  ) then
    return 'trusted';
  end if;

  return 'no_history';
end $fn$;
revoke execute on function public.customer_contraentrega_decision(uuid) from public, anon, authenticated;
grant execute on function public.customer_contraentrega_decision(uuid) to service_role;

-- 5 · Lista completa de 0272 más el aviso de seguridad.
create or replace function public.push_event_types()
  returns text[]
  language sql immutable set search_path = ''
as $$
  select array[
    'OrderStatusChanged',   -- ciclo del pedido (cliente, negocio y motorizado)
    'OrderExpired',         -- prepago sin comprobante (cliente)
    'OrderCreated',         -- pedido nuevo (negocio) + aviso anticipado (motorizado)
    'OrderQueued',          -- entro a la bandeja por reloj (motorizados)
    'OrderReleased',        -- el pedido vuelve a la bolsa (resto de motorizados)
    'OrderOverdue',         -- nadie lo ha tomado y se enfria (motorizados)
    'OrderProofVerified',   -- la cajera aprobo el comprobante (cliente)
    'OrderValidated',       -- el pedido paso el antifraude (cliente)
    'TransferRequested',    -- te piden tu pedido (dueño)
    'TransferResolved',     -- aceptado / rechazado / vencido (uno o los dos)
    'CashDelivered',        -- el motorizado declara efectivo (negocio)
    'CashConfirmed',        -- el negocio confirma (motorizado)
    'CashDisputed',         -- el negocio reporta diferencia (motorizado)
    'CashResolved',         -- Tindivo cierra el caso (motorizado)
    'CourierStepped',       -- Tindivo Entregas (motorizados y cliente)
    'CustomerPhoneMoved',   -- aviso persistente como agregado
    'PushDeliveryFailed'    -- avisos que se dieron por perdidos (admin), 0272
  ]::text[];
$$;
-- Igual que 0272: solo la usa el trigger, ningún rol la llama.
revoke all on function public.push_event_types() from public, anon, authenticated, service_role;

-- 6 · Copia de 0276: solo se añade FOR SHARE al leer el perfil sellado.
CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text, p_customer_notes text DEFAULT NULL::text, p_delivery_accuracy_m integer DEFAULT NULL::integer, p_delivery_confirmed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_pickup_timing text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Promo de lanzamiento «envío gratis» (0187)
  v_promo jsonb;
  v_promo_code text;
  v_promo_active boolean;
  v_promo_max int;
  v_promo_taken int;
  v_prior_delivered int;
  v_had_history boolean;
  v_verified_phone text;
  v_customer_phone text;
  v_phone_verified_at timestamptz;
  v_redemption_id uuid;
  v_promo_applied boolean := false;
  v_fee_source text := 'system';
  -- Promo de envío gratis por plato (0227: calendario semanal; 0230: fecha de corte)
  v_item_promo_distinct int;
  v_item_promo_days smallint[];
  v_item_free_delivery_until date;
  v_order_id uuid;
  v_short_id text;
  v_order_number int;
  v_delivery_fee numeric;
  v_order_amount numeric := 0;
  v_menu_item record;
  v_business record;
  v_coi_id uuid;
  v_item jsonb;
  v_optid text;
  v_qty int;
  v_unit numeric;
  v_mods jsonb;
  v_opt record;
  v_group record;
  v_selection_count int;
  v_selection_min int;
  v_line_total numeric;
  v_mod jsonb;
  v_status public.order_status := 'pending_acceptance';
  v_requires_validation boolean := false;
  v_validation_reason text := null;
  v_threshold numeric;
  v_vthreshold numeric;
  v_location jsonb;
  v_risk_flags jsonb := '{}'::jsonb;
  v_bands jsonb;
  v_band public.distance_band;
  v_max_accuracy numeric := 150;

  -- Burst detection
  v_same_phone_window int;
  v_same_phone_threshold int;
  v_same_phone_count int;

  v_nearby_window int;
  v_nearby_radius_m numeric;
  v_nearby_threshold int;
  v_nearby_count int;

  v_high_ticket_amount numeric;
  v_high_ticket_threshold int;
  v_new_high_ticket_count int;
  v_night_start timestamptz;

  -- Spike detection
  v_recent_hour_count int;
  v_avg_hourly numeric;
  v_spike_days int;
  v_spike_multiplier numeric;
  v_spike_min int;

  -- Guard de pedido activo (instrumentación del bloqueo)
  v_active_id uuid;
  v_active_short_id text;
  v_active_status public.order_status;

  -- B.3: Umbrales de efectivo (R2, R3)
  v_max_bill numeric;
  v_max_change numeric;

  -- 0211: motivo detrás del guard de contraentrega (trusted | risk_blocked | no_history)
  v_contraentrega_decision text;

  -- 0220: cuándo dijo el cliente que pasa por su recojo, y el atajo booleano.
  v_pickup_timing text;
  v_pickup_now boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  v_pickup_timing := case
    when p_delivery_method <> 'pickup' then null
    when p_pickup_timing in ('now', 'later') then p_pickup_timing
    else 'later'
  end;
  v_pickup_now := (v_pickup_timing = 'now');

  if p_payment_intent = 'pending_mixed' then
    raise exception 'El pago mixto no está disponible en el canal de cliente. Elige efectivo, Yape/Plin o prepago.'
      using errcode = 'P0001';
  end if;

  select o.id, o.short_id, o.status into v_active_id, v_active_short_id, v_active_status
  from public.orders o
  where o.customer_user_id = p_customer_user_id
    and o.business_id = p_business_id
    and o.status in (
      'validando', 'pending_acceptance', 'awaiting_payment', 'confirmed', 'preparing',
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up',
      'ready_for_pickup'
    )
  order by o.created_at desc
  limit 1;

  if v_active_short_id is not null then
    raise exception 'Ya tienes un pedido activo en este restaurante. Espera a que termine antes de hacer uno nuevo.'
      using errcode = 'P0001',
            detail = 'active_order_block:' || v_active_id::text || ':' || v_active_short_id
                     || ':' || v_active_status::text;
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;

  -- El número sellado vive en E.164; la operación y el antifraude usan 9 dígitos.
  select cp.phone, cp.phone_verified_at into v_customer_phone, v_phone_verified_at
  from public.customer_profiles cp where cp.user_id = p_customer_user_id for share;
  if v_phone_verified_at is null then
    raise exception 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      using errcode = 'P0001';
  end if;
  v_customer_phone := regexp_replace(v_customer_phone, '^[+]51', '');
  if v_customer_phone is null or v_customer_phone !~ '^9[0-9]{8}$' then
    raise exception 'El número de WhatsApp verificado no es válido.' using errcode = 'P0001';
  end if;

  if public.customer_is_blocked(p_customer_user_id, v_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  if p_payment_intent in ('pending_cash', 'pending_yape') then
    v_contraentrega_decision := public.customer_contraentrega_decision(p_customer_user_id);

    if v_contraentrega_decision = 'risk_blocked' then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    elsif v_contraentrega_decision = 'no_history' then
      if v_pickup_now then
        v_risk_flags := v_risk_flags || jsonb_build_object('pickupNowPresence', true);
      elsif not public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method) then
        raise exception 'Pago adelantado requerido para primer pedido.'
          using errcode = 'P0001';
      else
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'new_customer_local_gps');
        v_risk_flags := v_risk_flags || jsonb_build_object('newCustomerLocalGps', true);
      end if;
    end if;
  end if;

  if p_delivery_method = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Coordenadas de entrega obligatorias para delivery' using errcode = 'P0001';
    end if;

    if not public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) then
      raise exception 'Dirección fuera de la zona de reparto establecida para San Jacinto' using errcode = 'P0001';
    end if;

    if p_customer_gps_method is not null
       and p_customer_gps_method not in ('failed', 'manual_skip_prepaid') then
      if p_customer_gps_lat is null or p_customer_gps_lng is null then
        raise exception 'Coordenadas GPS del cliente incompletas' using errcode = 'P0001';
      end if;

      if public.geo_distance_km(p_customer_gps_lat, p_customer_gps_lng, p_delivery_lat::double precision, p_delivery_lng::double precision) > 0.4 then
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
    v_band := null;
  else
    v_band := public.delivery_band_for_point(p_delivery_lat, p_delivery_lng);
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> v_band::text)::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m,
    customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method,
    order_amount, delivery_fee, status,
    delivery_distance_band, delivery_fee_source,
    customer_notes,
    delivery_coordinates_accuracy_m, delivery_location_confirmed_at,
    pickup_timing
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, v_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system',
    left(nullif(btrim(regexp_replace(coalesce(p_customer_notes, ''), '\s+', ' ', 'g')), ''), 200),
    nullif(greatest(coalesce(p_delivery_accuracy_m, 0), 0), 0),
    p_delivery_confirmed_at,
    v_pickup_timing
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;

    if p_source = 'customer_pwa'
       and not public.menu_item_orderable_now(
             v_menu_item.available_days,
             v_menu_item.available_from,
             v_menu_item.available_to) then
      raise exception 'El item "%" no se sirve en este turno', v_menu_item.name
        using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    -- Una repetida es un error: deduplicarla cambiaría el precio visto.
    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb)) as selected(option_id)
      group by selected.option_id::uuid
      having count(*) > 1
    ) then
      raise exception 'Hay una opción repetida en «%».', v_menu_item.name
        using errcode = 'P0001';
    end if;

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

    -- Revisa también los grupos sin selección: pueden ser obligatorios.
    for v_group in
      select g.id, g.name, g.selection_type, g.is_required, g.min_selections, g.max_selections
      from public.menu_item_modifier_groups mig
      join public.menu_modifier_groups g on g.id = mig.group_id
      where mig.item_id = v_menu_item.id
      order by mig.display_order, g.id
    loop
      select count(*) into v_selection_count
      from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb)) as selected(option_id)
      join public.menu_modifier_options o on o.id = selected.option_id::uuid
      where o.group_id = v_group.id;

      if v_group.selection_type = 'single' then
        if v_selection_count > 1 then
          raise exception 'En «%» de «%» solo puedes elegir una opción.', v_group.name, v_menu_item.name
            using errcode = 'P0001';
        end if;
        if v_group.is_required and v_selection_count = 0 then
          raise exception 'Elige una opción de «%» en «%».', v_group.name, v_menu_item.name
            using errcode = 'P0001';
        end if;
      else
        if v_group.max_selections is not null and v_selection_count > v_group.max_selections then
          raise exception 'En «%» de «%» puedes elegir hasta % %.', v_group.name, v_menu_item.name,
            v_group.max_selections, case when v_group.max_selections = 1 then 'opción' else 'opciones' end
            using errcode = 'P0001';
        end if;
        v_selection_min := greatest(1, v_group.min_selections);
        if v_group.is_required and v_selection_count < v_selection_min then
          raise exception 'Elige al menos % % de «%» en «%».', v_selection_min,
            case when v_selection_min = 1 then 'opción' else 'opciones' end, v_group.name, v_menu_item.name
            using errcode = 'P0001';
        end if;
      end if;
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

  if p_delivery_method = 'delivery' and v_delivery_fee > 0 then
    select value into v_promo
      from public.app_settings
     where key = 'promo_free_delivery'
       for update;

    if found then
      v_promo_code   := v_promo ->> 'code';
      v_promo_active := coalesce((v_promo ->> 'active')::boolean, false);
      v_promo_max    := (v_promo ->> 'max_redemptions')::int;

      if v_promo_active
         and v_promo_code is not null
         and v_promo_max is not null
         and public.current_service_date()
               between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date
      then
        select count(*) into v_promo_taken
          from public.promo_redemptions
         where promo_code = v_promo_code
           and status in ('reserved', 'redeemed');

        if v_promo_taken < v_promo_max then
          select cp.phone into v_verified_phone
            from public.customer_profiles cp
           where cp.user_id = p_customer_user_id
             and cp.phone_verified_at is not null;

          if v_verified_phone is not null then
            select count(*) into v_prior_delivered
              from public.orders o
             where o.status = 'delivered'
               and (o.customer_user_id = p_customer_user_id
                    or o.customer_phone = v_verified_phone);

            v_had_history := public.customer_trusted_for_contraentrega(p_customer_user_id);

            insert into public.promo_redemptions (
              promo_code, customer_user_id, verified_phone, order_id,
              status, waived_amount, distance_band,
              prior_delivered_count, had_delivery_history
            ) values (
              v_promo_code, p_customer_user_id, v_verified_phone, v_order_id,
              'reserved', v_delivery_fee, v_band,
              v_prior_delivered, v_had_history
            )
            on conflict do nothing
            returning id into v_redemption_id;

            if v_redemption_id is not null then
              v_promo_applied := true;
              v_delivery_fee  := 0;
              v_fee_source    := 'promo';
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  -- ── PROMO DE ENVÍO GRATIS POR PLATO (0227: días de semana; 0230: fecha de
  -- corte) ─────────────────────────────────────────────────────────────────
  -- Mismo sitio y mismo criterio que siempre: hay que decidir antes de las
  -- validaciones de pago, que leen `v_delivery_fee`. `v_delivery_fee > 0` hace
  -- que si la promo de lanzamiento (arriba) ya dejó el envío en 0, este bloque
  -- no tenga nada que hacer.
  if p_source = 'customer_pwa'
     and p_delivery_method = 'delivery'
     and v_delivery_fee > 0
  then
    -- "Únicamente ese plato": el carrito no puede tener más de un menu_item_id
    -- distinto. La cantidad de ese plato no importa, ni si lleva modificadores.
    select count(distinct (elem ->> 'menu_item_id')) into v_item_promo_distinct
      from jsonb_array_elements(p_items) elem;

    if v_item_promo_distinct = 1 then
      select mi.free_delivery_days, mi.free_delivery_until
        into v_item_promo_days, v_item_free_delivery_until
        from public.menu_items mi
       where mi.id = (p_items -> 0 ->> 'menu_item_id')::uuid
         and mi.business_id = p_business_id;

      -- Las dos condiciones se combinan por "o": basta con que una aplique.
      if public.menu_item_free_delivery_day(v_item_promo_days)
         or public.menu_item_free_delivery_until(v_item_free_delivery_until)
      then
        v_delivery_fee := 0;
        v_fee_source   := 'promo';
      end if;
    end if;
  end if;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount + v_delivery_fee > v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'El total con envio (S/ %) pasa de S/ %, asi que el pago debe ser adelantado.',
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00'),
      to_char(v_threshold, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null then
    select (value #>> '{}')::numeric into v_max_bill from public.app_settings where key = 'max_cash_bill';
    v_max_bill := coalesce(v_max_bill, 100);

    v_max_change := public.effective_max_change(p_business_id);

    if p_client_pays_with > v_max_bill then
      raise exception 'El billete máximo aceptado es S/%. Usa un billete menor o paga con Yape/Plin.', v_max_bill
        using errcode = 'P0001';
    end if;

    if p_client_pays_with - (v_order_amount + v_delivery_fee) > v_max_change then
      raise exception 'El vuelto requerido (S/%) supera el vuelto disponible esta noche (S/%). Paga con un billete menor o usa Yape/Plin.',
        to_char(p_client_pays_with - (v_order_amount + v_delivery_fee), 'FM999990.00'),
        v_max_change
        using errcode = 'P0001';
    end if;
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
  where o.customer_phone = v_customer_phone
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
    v_status := 'pending_acceptance';
  else
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = v_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = v_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'standard_validation_rule');
    end if;

    if v_requires_validation then
      if v_pickup_now then
        v_risk_flags := v_risk_flags || jsonb_build_object('resolvedAtCounter', true);
      else
        v_status := 'validando';
      end if;
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    delivery_fee = v_delivery_fee,
    delivery_fee_source = v_fee_source,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2)
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method,
    'pickupTiming', v_pickup_timing,
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
    'total', v_order_amount + v_delivery_fee,
    'promoApplied', v_promo_applied,
    'pickupTiming', v_pickup_timing
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz, text) TO service_role;
create or replace function public.create_courier_order(
  p_customer_user_id uuid,
  p_requester_name text,
  p_requester_phone text,
  p_directory_business_id uuid,
  p_origin_name text,
  p_origin_phone text,
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_origin_reference_text text,
  p_destination_name text,
  p_destination_phone text,
  p_destination_lat numeric,
  p_destination_lng numeric,
  p_destination_reference_text text,
  p_item_description text,
  p_is_fragile boolean,
  p_ready_in_min int,
  p_payer public.courier_payer,
  p_weight_confirmed boolean,
  p_prepaid_confirmed boolean,
  p_utm_source text default null,
  p_driver_note text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_max_active int;
  v_fee numeric(10,2);
  v_distance_m numeric(10,2);
  v_short_id text;
  v_id uuid;
  v_order_number bigint;
  v_active_count int;
  v_unlimited boolean;
  v_requester_phone text;
  v_phone_verified_at timestamptz;
begin
  -- 0235: `is not true` y no `not`: con NULL, `if not null` no entra y la
  -- confirmación se saltaría (auditoría de Codex).
  if p_weight_confirmed is not true then
    raise exception 'Falta confirmar que lo que envías está permitido' using errcode = 'P0001';
  end if;
  if p_prepaid_confirmed is not true then
    raise exception 'Falta confirmar que ya pagaste tu pedido' using errcode = 'P0001';
  end if;

  select value into v_courier from public.app_settings where key = 'courier';
  if v_courier is null or coalesce((v_courier ->> 'enabled')::boolean, false) = false then
    raise exception 'courier_disabled' using errcode = 'P0001';
  end if;

  if not public.is_within_courier_schedule() then
    raise exception 'courier_closed' using errcode = 'P0001';
  end if;

  -- 0240: ya NO se exige un motorizado «disponible». La solicitud se crea y
  -- avisa por push a todos los motorizados activos (notificar no es asignar);
  -- si nadie la toma en `courierAcceptMinutes`, se cancela sola sin cobro.

  if not public.point_in_coverage_polygon(p_origin_lat, p_origin_lng) then
    raise exception 'courier_out_of_zone:origin' using errcode = 'P0001';
  end if;
  if not public.point_in_coverage_polygon(p_destination_lat, p_destination_lng) then
    raise exception 'courier_out_of_zone:destination' using errcode = 'P0001';
  end if;

  -- 0235: la cuenta con la que Jesús carga los pedidos de WhatsApp no tiene
  -- límite. Cada pedido suyo es de un cliente distinto; con el límite, solo
  -- podría atender uno a la vez.
  v_unlimited := coalesce(v_courier -> 'unlimitedRequesterUserIds', '[]'::jsonb)
    ? p_customer_user_id::text;

  -- Operación carga pedidos de terceros; los demás usan su número verificado.
  v_requester_phone := p_requester_phone;
  if not v_unlimited then
    select cp.phone, cp.phone_verified_at into v_requester_phone, v_phone_verified_at
    from public.customer_profiles cp where cp.user_id = p_customer_user_id for share;
    v_requester_phone := regexp_replace(v_requester_phone, '^[+]51', '');
    if v_phone_verified_at is null or v_requester_phone is null
       or v_requester_phone !~ '^9[0-9]{8}$' then
      raise exception 'courier_phone_not_verified' using errcode = 'P0001';
    end if;

    -- 0235: serializa por celular ANTES de contar. Sin esto, dos solicitudes
    -- simultáneas del mismo celular cuentan 0 cada una y entran las dos.
    perform pg_advisory_xact_lock(hashtext('courier_phone:' || v_requester_phone));
    v_max_active := coalesce((v_courier ->> 'maxActivePerPhone')::int, 1);
    select count(*) into v_active_count
      from public.courier_orders
      where requester_phone = v_requester_phone
        and status not in ('delivered', 'cancelled');
    if v_active_count >= v_max_active then
      raise exception 'courier_active_limit' using errcode = 'P0001';
    end if;
  end if;

  v_fee := coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00);
  v_distance_m := public.geo_distance_km(
    p_origin_lat::double precision, p_origin_lng::double precision,
    p_destination_lat::double precision, p_destination_lng::double precision
  ) * 1000;
  v_short_id := public.generate_courier_short_id();

  -- 0235: «listo y pagado» significa listo AHORA. `p_ready_in_min` se ignora:
  -- un pedido «para dentro de dos horas» bloquearía al motorizado.
  insert into public.courier_orders (
    short_id, customer_user_id, requester_name, requester_phone,
    directory_business_id,
    origin_name, origin_phone, origin_lat, origin_lng, origin_reference_text,
    destination_name, destination_phone, destination_lat, destination_lng, destination_reference_text,
    item_description, is_fragile, ready_in_min, ready_at,
    payer, fee_amount, distance_m, weight_confirmed, prepaid_confirmed,
    utm_source, driver_note
  ) values (
    v_short_id, p_customer_user_id, p_requester_name, v_requester_phone,
    p_directory_business_id,
    p_origin_name, p_origin_phone, p_origin_lat, p_origin_lng, p_origin_reference_text,
    p_destination_name, p_destination_phone, p_destination_lat, p_destination_lng, p_destination_reference_text,
    p_item_description, p_is_fragile, 0, now(),
    p_payer, v_fee, v_distance_m, p_weight_confirmed, p_prepaid_confirmed,
    p_utm_source, nullif(btrim(p_driver_note), '')
  )
  returning id, order_number into v_id, v_order_number;

  insert into public.courier_order_events (courier_order_id, event_type, actor_role, actor_user_id, data)
  values (v_id, 'courier.requested', 'customer', p_customer_user_id,
    jsonb_build_object('feeAmount', v_fee, 'distanceM', v_distance_m));

  return jsonb_build_object(
    'id', v_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'requested',
    'feeAmount', v_fee,
    'distanceM', v_distance_m
  );
end;
$$;
revoke execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text, text
) to service_role;

-- 7 · PostgREST no debe encontrar sobrecargas ni estados incompletos.
do $$
declare
  v_function text;
  v_table text;
  v_role text;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'push_event_types') <> 1 then
    raise exception '0277: se esperaba una sola función push_event_types';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'push_event_types'
      and (p.prosecdef or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception '0277: push_event_types debe quedar como en 0272';
  end if;
  foreach v_function in array array['claim_customer_phone', 'customer_is_blocked',
    'customer_requires_prepayment', 'customer_contraentrega_decision',
    'create_customer_order', 'create_courier_order'] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_function) <> 1 then
      raise exception '0277: se esperaba una sola función %', v_function;
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_function
        and (not p.prosecdef or p.proconfig is distinct from array['search_path=""']
          or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or not has_function_privilege('service_role', p.oid, 'execute'))) then
      raise exception '0277: revisar SECURITY DEFINER, search_path o permisos de %', v_function;
    end if;
  end loop;
  if exists (select phone from public.customer_profiles where phone_verified_at is not null
             group by phone having count(*) > 1) then
    raise exception '0277: quedan perfiles con el mismo número verificado';
  end if;
  if exists (select 1 from public.customer_profiles cp where cp.phone_verified_at is not null
    and not exists (select 1 from public.phone_assignments a where a.user_id = cp.user_id
      and a.phone = cp.phone and a.ended_at is null)) then
    raise exception '0277: hay perfiles verificados sin su asignación abierta';
  end if;
  foreach v_table in array array['phone_assignments', 'phone_transfer_challenges',
                               'phone_restrictions', 'customer_security_notices'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || v_table, 'INSERT,UPDATE,DELETE,TRUNCATE')
         or has_any_column_privilege(v_role, 'public.' || v_table, 'INSERT,UPDATE') then
        raise exception '0277: % puede escribir en %', v_role, v_table;
      end if;
    end loop;
  end loop;
end;
$$;
