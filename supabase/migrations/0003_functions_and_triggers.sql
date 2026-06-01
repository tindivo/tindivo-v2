-- =============================================================================
-- 0003 · Funciones y triggers
-- Idempotente (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- Helpers SECURITY DEFINER con SET search_path = '' (anti search-path hijacking).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de RLS (SECURITY DEFINER, search_path fijo, refs totalmente calificadas)
-- ----------------------------------------------------------------------------

create or replace function public.current_user_role() returns text
  language sql stable security definer set search_path = ''
as $$ select primary_role::text from public.users where id = (select auth.uid()); $$;

create or replace function public.current_user_has_role(p_role public.user_role) returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = p_role); $$;

create or replace function public.current_business_id() returns uuid
  language sql stable security definer set search_path = ''
as $$ select id from public.businesses where user_id = (select auth.uid()); $$;

create or replace function public.current_driver_id() returns uuid
  language sql stable security definer set search_path = ''
as $$ select id from public.drivers where user_id = (select auth.uid()); $$;

-- ¿Negocio publicado/activo/no bloqueado? Desacopla la visibilidad pública del
-- menú/horario de la RLS de businesses (que ya no expone la tabla base a anon).
create or replace function public.is_published_business(p_business_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = p_business_id and publishes_catalog = true and is_active = true and is_blocked = false
  );
$$;

-- ----------------------------------------------------------------------------
-- Generador de short_id — muestrea del MISMO alfabeto que el VO y el CHECK
-- (32 símbolos, sin I/O/0/1). Reemplaza el md5 del spec que producía 0/1.
-- ----------------------------------------------------------------------------
create or replace function public.generate_short_id() returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_short_id text;
  v_i int;
  v_attempts int := 0;
begin
  loop
    v_short_id := '';
    for v_i in 1..8 loop
      v_short_id := v_short_id || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.orders where short_id = v_short_id);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'No se pudo generar short_id único tras 20 intentos';
    end if;
  end loop;
  return v_short_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tracking público (SECURITY DEFINER, ventana 24h post-entrega)
-- NO expone el nombre del cliente (PII) a anon. Sí el nombre del motorizado.
-- ----------------------------------------------------------------------------
create or replace function public.get_tracking(p_short_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'shortId', o.short_id,
    'orderNumber', o.order_number,
    'businessName', b.name,
    'businessAccentColor', b.accent_color,
    'status', o.status,
    'deliveryMethod', o.delivery_method,
    'estimatedReadyAt', o.estimated_ready_at,
    'deliveredAt', o.delivered_at,
    'driverName', d.full_name,
    'amount', o.order_amount,
    'deliveryFee', o.delivery_fee,
    'createdAt', o.created_at
  )
  into v_result
  from public.orders o
  join public.businesses b on b.id = o.business_id
  left join public.drivers d on d.id = o.driver_id
  where o.short_id = p_short_id
    and (o.delivered_at is null or o.delivered_at > now() - interval '24 hours');
  return v_result;
end;
$$;
grant execute on function public.get_tracking(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Sync auth.users -> public.users (+ user_roles)
-- SEGURIDAD: el rol NUNCA se toma de raw_user_meta_data (editable por el cliente
-- en supabase.auth.signUp). Solo raw_app_meta_data (que setea service_role/admin)
-- puede elevar el rol; se valida contra allowlist y degrada a 'customer'.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_raw text;
  v_role public.user_role;
begin
  v_raw := new.raw_app_meta_data ->> 'primary_role';
  if v_raw is null or v_raw not in ('customer', 'business', 'driver', 'admin') then
    v_role := 'customer';
  else
    v_role := v_raw::public.user_role;
  end if;
  insert into public.users (id, email, full_name, primary_role, is_active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), v_role, true)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- touch updated_at en toda TABLA BASE con esa columna (relkind='r' => no vistas)
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

do $$
declare r record;
begin
  for r in
    select c.relname as table_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where a.attname = 'updated_at' and not a.attisdropped
      and n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('drop trigger if exists touch_%1$I on public.%1$I;', r.table_name);
    execute format(
      'create trigger touch_%1$I before update on public.%1$I for each row execute function public.touch_updated_at();',
      r.table_name
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Derivar primary_capability del negocio
-- ----------------------------------------------------------------------------
create or replace function public.derive_business_primary_capability(
  p_publishes_catalog boolean,
  p_accepts_web_pickup boolean,
  p_accepts_web_delivery boolean,
  p_uses_tindivo_drivers boolean
) returns public.business_primary_capability
  language plpgsql immutable
as $$
begin
  if not p_publishes_catalog then
    if p_uses_tindivo_drivers then return 'drivers_only'::public.business_primary_capability;
    else return 'pickup_local'::public.business_primary_capability; end if;
  end if;
  if p_accepts_web_pickup and p_accepts_web_delivery then
    return 'catalog_full'::public.business_primary_capability;
  elsif p_accepts_web_delivery then
    return 'catalog_delivery'::public.business_primary_capability;
  else
    return 'catalog_pickup'::public.business_primary_capability;
  end if;
end;
$$;

create or replace function public.update_business_primary_capability() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.primary_capability := public.derive_business_primary_capability(
    new.publishes_catalog, new.accepts_web_pickup, new.accepts_web_delivery, new.uses_tindivo_drivers
  );
  return new;
end;
$$;

drop trigger if exists trg_businesses_derive_primary_capability on public.businesses;
create trigger trg_businesses_derive_primary_capability
  before insert or update of publishes_catalog, accepts_web_pickup, accepts_web_delivery, uses_tindivo_drivers
  on public.businesses
  for each row execute function public.update_business_primary_capability();

-- ----------------------------------------------------------------------------
-- orders: BEFORE write — genera short_id si falta y setea timestamps de transición
-- (garantiza short_id NOT NULL y que los failsafe crons tengan los *_at poblados)
-- ----------------------------------------------------------------------------
create or replace function public.orders_before_write() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.short_id is null then
    new.short_id := public.generate_short_id();
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    case new.status
      when 'validando' then new.validating_at := coalesce(new.validating_at, now());
      when 'pending_acceptance' then new.pending_acceptance_at := coalesce(new.pending_acceptance_at, now());
      when 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now());
      when 'preparing' then new.preparing_at := coalesce(new.preparing_at, now());
      when 'waiting_driver' then new.waiting_driver_at := coalesce(new.waiting_driver_at, now());
      when 'heading_to_restaurant' then new.heading_at := coalesce(new.heading_at, now());
      when 'waiting_at_restaurant' then new.waiting_at_restaurant_at := coalesce(new.waiting_at_restaurant_at, now());
      when 'picked_up' then new.picked_up_at := coalesce(new.picked_up_at, now());
      when 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_before_write on public.orders;
create trigger trg_orders_before_write
  before insert or update on public.orders
  for each row execute function public.orders_before_write();

-- assigned_at en orders
create or replace function public.update_assigned_at() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if old.driver_id is null and new.driver_id is not null then new.assigned_at = now();
  elsif old.driver_id is not null and new.driver_id is null then new.assigned_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_assigned_at on public.orders;
create trigger trg_orders_set_assigned_at
  before update of driver_id on public.orders
  for each row execute function public.update_assigned_at();

-- ----------------------------------------------------------------------------
-- Auditoría: registra TODO cambio de estado en order_status_history
-- (fuente única del historial; el API no inserta historial manualmente).
-- SECURITY DEFINER para escribir aunque el invocador tenga RLS restrictiva.
-- ----------------------------------------------------------------------------
create or replace function public.log_order_status_change() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, status, changed_by, notes)
    values (new.id, new.status, null, null);
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, changed_by, notes)
    values (new.id, new.status, new.cancelled_by, new.cancel_note);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_log_status on public.orders;
create trigger trg_orders_log_status
  after insert or update of status on public.orders
  for each row execute function public.log_order_status_change();

-- ----------------------------------------------------------------------------
-- balance_due: suma comisión al entregar; revierte si se sale de delivered;
-- resta al registrar pago + desbloqueo por mora (flag estructurado).
-- ----------------------------------------------------------------------------
create or replace function public.update_business_balance() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE') then
    if old.status <> 'delivered' and new.status = 'delivered' then
      update public.businesses
        set balance_due = balance_due + coalesce(new.tindivo_commission, 0)
        where id = new.business_id;
    elsif old.status = 'delivered' and new.status <> 'delivered' then
      update public.businesses
        set balance_due = greatest(0, balance_due - coalesce(old.tindivo_commission, 0))
        where id = new.business_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_balance_due on public.orders;
create trigger trg_orders_balance_due
  after update of status on public.orders
  for each row execute function public.update_business_balance();

create or replace function public.decrement_balance_on_payment() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.businesses
    set balance_due = greatest(0, balance_due - new.amount),
        last_payment_at = new.paid_at
    where id = new.business_id;
  -- Desbloqueo automático por mora si quedó sin deuda (flag estructurado, no LIKE)
  update public.businesses
    set is_blocked = false, blocked_for_debt = false, block_reason = null
    where id = new.business_id
      and blocked_for_debt = true
      and balance_due = 0;
  return new;
end;
$$;

drop trigger if exists trg_restaurant_payments_decrement_balance on public.restaurant_payments;
create trigger trg_restaurant_payments_decrement_balance
  after insert on public.restaurant_payments
  for each row execute function public.decrement_balance_on_payment();
