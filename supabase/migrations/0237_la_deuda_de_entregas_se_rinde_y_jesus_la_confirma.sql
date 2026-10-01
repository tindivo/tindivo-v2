-- ════════════════════════════════════════════════════════════════════════════
-- 0237 · La deuda de Entregas se rinde, y Jesús la confirma
--
-- Hasta ahora el cobro del transporte (S/ 3) no tenía camino de vuelta en la
-- app: al cerrar el turno Jesús corría la consulta de cuadre y lo descontaba
-- del pago (mvp-entregas-v1.md §5). Ahora sigue el MISMO flujo que el
-- efectivo de la comida, entrega por entrega:
--
--   cobrada (transport_collected_at) → «Entregar» del motorizado (remitted_at)
--   → «Confirmar» de Jesús desde admin (remittance_confirmed_at/_by)
--
-- CUENTA TODO LO COBRADO, TAMBIÉN EL YAPE. El Yape entra al QR del propio
-- motorizado, así que es plata de Tindivo en su bolsillo igual que el
-- efectivo. Y cuenta también las entregas canceladas DESPUÉS de cobrar (la
-- consulta de cuadre ya lo hacía así): el dato es `transport_collected_at`, no
-- el estado.
--
-- Columnas en `courier_orders` y no una tabla `courier_remittances`: la unidad
-- es la entrega (una línea, un monto) y ya hay una fila por entrega. El log de
-- quién hizo qué va a `courier_order_events`, como el resto de pasos.
--
-- Sin disputa por ahora: si no cuadra, Jesús no confirma y lo habla. Con un
-- motorizado en el piloto, una pantalla de disputas sería más que el problema.
--
-- Idempotente: `add column if not exists`, `drop constraint if exists` y
-- `create or replace`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Columnas ────────────────────────────────────────────────────────────

alter table public.courier_orders add column if not exists remitted_at timestamptz;
alter table public.courier_orders add column if not exists remittance_confirmed_at timestamptz;
alter table public.courier_orders
  add column if not exists remittance_confirmed_by uuid references public.users(id);

-- Nada se rinde sin haberse cobrado, ni se confirma sin haberse rendido.
alter table public.courier_orders drop constraint if exists co_remit_after_collect;
alter table public.courier_orders add constraint co_remit_after_collect
  check (remitted_at is null or transport_collected_at is not null);
alter table public.courier_orders drop constraint if exists co_confirm_after_remit;
alter table public.courier_orders add constraint co_confirm_after_remit
  check (
    remittance_confirmed_at is null
    or (remitted_at is not null and remittance_confirmed_by is not null)
  );

comment on column public.courier_orders.remitted_at is
  'Cuándo el motorizado dijo que entregó a Tindivo lo cobrado (Yape o efectivo). 0237.';
comment on column public.courier_orders.remittance_confirmed_at is
  'Cuándo Jesús (admin) confirmó que lo recibió. Con esto la entrega sale de la deuda. 0237.';

-- La deuda viva de un motorizado: cobrada y sin confirmar.
create index if not exists co_driver_debt_idx on public.courier_orders (driver_id)
  where transport_collected_at is not null and remittance_confirmed_at is null;

-- ── 2 · El motorizado: «Entregar» ───────────────────────────────────────────

create or replace function public.driver_remit_courier_fee(
  p_courier_order_id uuid,
  p_actor_user_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_row public.courier_orders;
begin
  select id into v_driver_id from public.drivers where user_id = p_actor_user_id;
  if v_driver_id is null then
    raise exception 'courier_driver_not_found' using errcode = 'P0001';
  end if;

  select * into v_row from public.courier_orders where id = p_courier_order_id for update;
  -- Una entrega ajena o inexistente se ve igual: no se filtra cuál es cuál.
  if v_row.id is null or v_row.driver_id is distinct from v_driver_id then
    raise exception 'courier_not_found' using errcode = 'P0001';
  end if;
  if v_row.transport_collected_at is null then
    raise exception 'courier_not_collected' using errcode = 'P0001';
  end if;

  -- Idempotente: el segundo toque (o el reintento tras un corte) no mueve la hora.
  if v_row.remitted_at is null then
    update public.courier_orders set remitted_at = now() where id = v_row.id
      returning * into v_row;
    insert into public.courier_order_events
      (courier_order_id, event_type, actor_role, actor_user_id, data)
    values (v_row.id, 'courier.fee_remitted', 'driver', p_actor_user_id,
      jsonb_build_object('amount', v_row.fee_amount, 'paymentMethod', v_row.payment_method));
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'remittedAt', v_row.remitted_at,
    'confirmedAt', v_row.remittance_confirmed_at
  );
end;
$$;

revoke execute on function public.driver_remit_courier_fee(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.driver_remit_courier_fee(uuid, uuid) to service_role;

-- ── 3 · Jesús: «Confirmar» ──────────────────────────────────────────────────

create or replace function public.admin_confirm_courier_remittance(
  p_courier_order_id uuid,
  p_actor_user_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.courier_orders;
begin
  -- La API ya exige el rol; esto es la segunda llave, por si alguien llama la
  -- RPC con el service role desde otro sitio.
  if not exists (
    select 1 from public.user_roles where user_id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'courier_not_admin' using errcode = 'P0001';
  end if;

  select * into v_row from public.courier_orders where id = p_courier_order_id for update;
  if v_row.id is null then
    raise exception 'courier_not_found' using errcode = 'P0001';
  end if;
  if v_row.remitted_at is null then
    raise exception 'courier_not_remitted' using errcode = 'P0001';
  end if;

  if v_row.remittance_confirmed_at is null then
    update public.courier_orders
      set remittance_confirmed_at = now(), remittance_confirmed_by = p_actor_user_id
      where id = v_row.id
      returning * into v_row;
    insert into public.courier_order_events
      (courier_order_id, event_type, actor_role, actor_user_id, data)
    values (v_row.id, 'courier.fee_remittance_confirmed', 'admin', p_actor_user_id,
      jsonb_build_object('amount', v_row.fee_amount, 'paymentMethod', v_row.payment_method));
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'remittedAt', v_row.remitted_at,
    'confirmedAt', v_row.remittance_confirmed_at
  );
end;
$$;

revoke execute on function public.admin_confirm_courier_remittance(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_confirm_courier_remittance(uuid, uuid) to service_role;
