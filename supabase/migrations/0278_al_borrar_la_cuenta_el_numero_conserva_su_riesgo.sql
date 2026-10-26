-- =============================================================================
-- 0278 · Al borrar la cuenta, el número conserva su riesgo; Admin puede levantarlo.
-- S2b del plan del teléfono. D-44 (qué se conserva al borrar una cuenta) y D-63
-- (el riesgo se queda con el número). Hasta aquí, 0259 borraba el perfil y con él
-- `blocked_until` y `contraentrega_blocked`: el número quedaba libre y limpio para
-- otra cuenta. Ahora:
--   · el bloqueo vigente y el prepago obligatorio pasan a `phone_restrictions`
--     (origen 'account_deleted', mismo plazo), igual que en un traslado;
--   · la asignación se cierra y se CONSERVA (antifraude por teléfono, como
--     `customer_strikes`): sin ella, quien tome el número heredaría la confianza
--     del directorio y de las reglas de 0211 (P5 de 0277);
--   · el desafío de traslado y el aviso de seguridad, que son de la persona, se borran;
--   · las cuatro tablas de 0277 rechazan escrituras nuevas sobre una cuenta borrada
--     (`reject_deleted_account`, como las demás tablas de 0259).
-- Además, `lift_phone_restriction` deja que un admin levante una restricción con
-- un motivo escrito (la excepción por WhatsApp de D-63). No toca strikes ni dinero.
-- =============================================================================

-- 1 · Nuevo origen de una restricción, y un levantamiento siempre completo.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.phone_restrictions'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%source%'
  loop
    execute format('alter table public.phone_restrictions drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.phone_restrictions add constraint phone_restrictions_source_check
  check (source in ('transfer', 'replaced', 'account_deleted'));
alter table public.phone_restrictions drop constraint if exists phone_restrictions_lift_check;
alter table public.phone_restrictions add constraint phone_restrictions_lift_check
  check ((lifted_at is null) = (lifted_by is null) and (lifted_at is null) = (lift_reason is null)
    and (lift_reason is null or char_length(lift_reason) between 3 and 300));

-- 2 · El borrado: igual que 0259 salvo el bloque marcado 0278.
create or replace function public.delete_customer_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       public.users%rowtype;
  v_blockers   jsonb;
  v_orders     integer;
  v_courier    integer;
  v_order_ids  uuid[];
  v_courier_ids uuid[];
  v_ref_ids    text[];
  -- Centro de San Jacinto: las carreras de Entregas exigen coordenadas dentro del
  -- pueblo (`co_*_in_town`), así que el punto exacto se sustituye por uno válido.
  c_lat constant numeric := -9.15;
  c_lng constant numeric := -78.28;
  c_gone constant text := 'Cuenta eliminada';
  v_phone      text;
  v_verified_at timestamptz;
begin
  -- ORDEN DE CANDADOS, común con `customer_address_save`: primero el candado de
  -- aviso de la libreta de este usuario, después `users`, después sus direcciones.
  -- Antes la libreta tomaba dirección → usuario (al insertar) y el borrado usuario →
  -- dirección: un abrazo mortal esperando a pasar.
  perform pg_advisory_xact_lock(hashtextextended('customer_address:' || p_user_id::text, 0));

  -- El candado que cierra la carrera (ver arriba).
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if v_user.deleted_at is not null then
    return jsonb_build_object('status', 'already_deleted');
  end if;

  v_blockers := public.account_deletion_blockers(p_user_id);
  if (v_blockers ->> 'activeOrders')::int > 0
     or (v_blockers ->> 'activeCourierOrders')::int > 0 then
    return jsonb_build_object('status', 'blocked', 'reason', 'active_orders', 'blockers', v_blockers);
  end if;
  if (v_blockers ->> 'openMoneyReports')::int > 0 then
    return jsonb_build_object('status', 'blocked', 'reason', 'open_money_reports', 'blockers', v_blockers);
  end if;
  if jsonb_array_length(v_blockers -> 'otherRoles') > 0 then
    return jsonb_build_object('status', 'blocked', 'reason', 'other_roles', 'blockers', v_blockers);
  end if;

  -- La lápida primero: desde aquí, el resto de la transacción ya es irreversible.
  update public.users set
    email = 'deleted-' || p_user_id::text || '@deleted.tindivo.invalid',
    full_name = null,
    is_active = false,
    deleted_at = now()
  where id = p_user_id;

  -- El guard de `reject_deleted_account` no debe frenar a esta misma transacción.
  perform set_config('tindivo.deleting_account', p_user_id::text, true);

  select coalesce(array_agg(id), '{}') into v_order_ids
  from public.orders where customer_user_id = p_user_id;
  select coalesce(array_agg(id), '{}') into v_courier_ids
  from public.courier_orders where customer_user_id = p_user_id;
  -- Con qué ids puede aparecer el usuario DENTRO de un payload (no solo como aggregate_id).
  v_ref_ids := (select coalesce(array_agg(x::text), '{}') from unnest(v_order_ids || v_courier_ids) x);

  -- Pedidos del restaurante: se queda la fila con su importe, estado y fechas.
  update public.orders set
    customer_name = c_gone,
    customer_phone = null,
    delivery_address = null,
    delivery_reference = null,
    delivery_maps_url = null,
    delivery_coordinates_lat = null,
    delivery_coordinates_lng = null,
    delivery_coordinates_accuracy_m = null,
    customer_notes = null,
    customer_gps_lat = null,
    customer_gps_lng = null,
    customer_gps_accuracy_m = null,
    customer_gps_distance_to_center_km = null,
    arrived_at_customer_lat = null,
    arrived_at_customer_lng = null,
    arrived_at_customer_accuracy_m = null,
    address_directory_id = null,
    -- Texto libre que escribieron el negocio y el motorizado sobre esta persona.
    business_notes = null,
    driver_notes = null,
    cancel_note = null,
    rejection_reason_text = null
  where customer_user_id = p_user_id;
  get diagnostics v_orders = row_count;

  update public.customer_order_items set note = null where order_id = any (v_order_ids);
  update public.order_status_history set notes = null where order_id = any (v_order_ids);
  -- Motivos escritos a mano por el motorizado (traspasos y rechazos de asignación).
  update public.order_transfer_requests set reason = null where order_id = any (v_order_ids);
  update public.order_assignment_rejections set reason = null where order_id = any (v_order_ids);
  update public.order_event_log set data = public.redact_personal_json(data)
  where order_id = any (v_order_ids);
  update public.domain_events set
    payload = public.redact_personal_json(payload),
    metadata = public.redact_personal_json(metadata),
    -- Texto de error del despacho: puede arrastrar el payload tal cual.
    last_error = null
  where (aggregate_type in ('order', 'courier_order') and aggregate_id = any (v_order_ids || v_courier_ids))
     -- Único evento de otro agregado (la liquidación) que lleva datos del cliente: se
     -- localiza por UUID del payload, nunca por `short_id` (único por tabla, no entre
     -- `orders` y `courier_orders`). Acotado por tipo para usar `de_event_type_idx`; un
     -- test de integración falla si aparece otro productor.
     or (event_type = 'CashDelivered' and (
           payload ->> 'orderId' = any (v_ref_ids)
        or payload ->> 'order_id' = any (v_ref_ids)
        or payload ->> 'courierOrderId' = any (v_ref_ids)));

  -- Entregas: los datos de quien pidió y de quien recibe. El origen NO se conserva
  -- tal cual aunque haya `directory_business_id`: la ruta acepta ese id y los
  -- datos de contacto por separado, así que el snapshot puede traer un teléfono o
  -- una referencia personal que nadie verificó. Con negocio del directorio se
  -- sustituye por los datos canónicos del directorio; sin él, por el borrado.
  update public.courier_orders set
    requester_name = c_gone,
    requester_phone = 'eliminado',
    destination_name = c_gone,
    destination_phone = null,
    destination_lat = c_lat,
    destination_lng = c_lng,
    destination_reference_text = 'Dato eliminado',
    item_description = 'Dato eliminado',
    driver_note = null,
    utm_source = null,
    origin_phone = (select d.phone from public.directory_businesses d
                    where d.id = courier_orders.directory_business_id),
    origin_name = coalesce((select d.name from public.directory_businesses d
                            where d.id = courier_orders.directory_business_id), c_gone),
    origin_lat = coalesce((select d.lat from public.directory_businesses d
                           where d.id = courier_orders.directory_business_id), c_lat),
    origin_lng = coalesce((select d.lng from public.directory_businesses d
                           where d.id = courier_orders.directory_business_id), c_lng),
    origin_reference_text = coalesce((select d.reference_text from public.directory_businesses d
                                      where d.id = courier_orders.directory_business_id),
                                     'Dato eliminado')
  where customer_user_id = p_user_id;
  get diagnostics v_courier = row_count;

  update public.courier_order_events set data = public.redact_personal_json(data)
  where courier_order_id = any (v_courier_ids);

  -- Reseñas: la nota se queda, sin autor.
  update public.order_reviews set customer_user_id = null where customer_user_id = p_user_id;

  -- 0278 · El número verificado se lleva el riesgo de la cuenta, con el mismo plazo
  -- (D-63), y su historia se queda (D-44: antifraude por teléfono): quien lo tome
  -- después empieza sin la confianza de esta cuenta (P5 de 0277). Va antes de borrar
  -- el perfil, porque keep_phone_restrictions lee de ahí el bloqueo y el prepago.
  select cp.phone, cp.phone_verified_at into v_phone, v_verified_at
  from public.customer_profiles cp
  where cp.user_id = p_user_id and cp.phone_verified_at is not null;
  if v_phone is not null then
    perform public.keep_phone_restrictions(v_phone, p_user_id, 'account_deleted');
    -- Un perfil sellado fuera de claim_customer_phone (seeds) no tiene asignación:
    -- se registra ya cerrada para que la historia exista igual.
    if not exists (select 1 from public.phone_assignments a
                   where a.user_id = p_user_id and a.ended_at is null) then
      insert into public.phone_assignments(phone, user_id, started_at, start_reason, ended_at, end_reason)
      values (v_phone, p_user_id, v_verified_at, 'verification', now(), 'account_deleted');
    end if;
  end if;
  update public.phone_assignments set ended_at = now(), end_reason = 'account_deleted'
  where user_id = p_user_id and ended_at is null;
  -- El desafío de traslado y el aviso de seguridad son de la persona: se van.
  delete from public.phone_transfer_challenges where user_id = p_user_id;
  delete from public.customer_security_notices where user_id = p_user_id;

  delete from public.customer_addresses where user_id = p_user_id;
  delete from public.customer_profiles where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.terms_acceptance where user_id = p_user_id;
  delete from public.order_review_dismissals where customer_user_id = p_user_id;
  delete from public.promo_redemptions where customer_user_id = p_user_id;
  delete from public.customer_otp_attempts where user_id = p_user_id;
  delete from public.user_roles where user_id = p_user_id;

  -- La identidad, en la MISMA transacción: o se va todo o no se va nada. Libera
  -- el correo y la cuenta de Google/Apple para quien quiera volver a registrarse.
  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'status', 'deleted',
    'ordersAnonymized', v_orders,
    'courierOrdersAnonymized', v_courier
  );
end;
$$;

revoke all on function public.delete_customer_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_customer_account(uuid) to service_role;
comment on function public.delete_customer_account(uuid) is
  'Borrado de cuenta del cliente: anonimiza pedidos y logs, borra lo personal y la identidad; el número verificado conserva su riesgo (0278). Devuelve status deleted | already_deleted | blocked. Ver 0259 y 0278.';

-- 3 · Una cuenta borrada no recibe filas nuevas en las tablas de 0277. Sobre las
-- suyas solo cambian las columnas operativas: el cierre de la asignación y el
-- levantamiento de una restricción.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('phone_assignments', 'user_id', 'ended_at,end_reason'),
      ('phone_transfer_challenges', 'user_id', ''),
      ('customer_security_notices', 'user_id', ''),
      ('phone_restrictions', 'source_user_id', 'lifted_at,lifted_by,lift_reason')
    ) as v(tbl, col, cols)
  loop
    execute format('drop trigger if exists trg_reject_deleted_account on public.%I', t.tbl);
    execute format(
      'create trigger trg_reject_deleted_account before insert or update on public.%I '
      'for each row when (new.%I is not null) '
      'execute function public.reject_deleted_account(%L, %L)',
      t.tbl, t.col, t.col, t.cols);
  end loop;
end;
$$;

-- 4 · Admin levanta una restricción. La API comprueba el rol con la sesión; la
-- función lo vuelve a comprobar con el id que recibe, porque es SECURITY DEFINER.
create or replace function public.lift_phone_restriction(p_restriction_id uuid, p_admin_user_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.phone_restrictions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'El motivo debe tener entre 3 y 300 caracteres' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_roles ur
                 where ur.user_id = p_admin_user_id and ur.role = 'admin') then
    raise exception 'Solo un admin puede levantar una restricción' using errcode = '42501';
  end if;
  select * into v_row from public.phone_restrictions where id = p_restriction_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_row.lifted_at is not null then
    return jsonb_build_object('status', 'already_lifted');
  end if;
  update public.phone_restrictions
     set lifted_at = now(), lifted_by = p_admin_user_id, lift_reason = v_reason
   where id = p_restriction_id;
  return jsonb_build_object('status', 'lifted');
end;
$$;
revoke all on function public.lift_phone_restriction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.lift_phone_restriction(uuid, uuid, text) to service_role;

-- 5 · Comprobación final.
do $$
declare
  v_table text;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('delete_customer_account', 'lift_phone_restriction')) <> 2 then
    raise exception '0278: se esperaba una sola versión de cada función';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('delete_customer_account', 'lift_phone_restriction')
      and (not p.prosecdef or p.proconfig is distinct from array['search_path=""']
        or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or not has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception '0278: revisar SECURITY DEFINER, search_path o permisos del borrado o del levantamiento';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'keep_phone_restrictions'
      and (p.prosecdef or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception '0278: keep_phone_restrictions no se llama desde fuera';
  end if;
  foreach v_table in array array['phone_assignments', 'phone_transfer_challenges',
                                 'customer_security_notices', 'phone_restrictions'] loop
    if not exists (select 1 from pg_trigger
                   where tgrelid = ('public.' || v_table)::regclass
                     and tgname = 'trg_reject_deleted_account' and not tgisinternal) then
      raise exception '0278: falta el guard de cuenta borrada en %', v_table;
    end if;
  end loop;
end;
$$;
