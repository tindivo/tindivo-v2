-- 0259 · El cliente puede borrar su cuenta (MV5, Apple 5.1.1(v) y Google «Account deletion»)
--
-- Diseño: Docs/trabajo/movil/07-publicacion-tiendas.md §8 y 08-mv5-requisitos-revision.md.
-- PROPUESTA: toca datos personales y la retención está en D-44 (abierta). No se aplica
-- a `tindivo-prod` sin la revisión de Jesús y de Codex.
--
-- «Borrar la cuenta» = ANONIMIZAR y DESACTIVAR, en una sola transacción, porque
-- `orders.customer_user_id` y `courier_orders.customer_user_id` son NO ACTION: los
-- pedidos son la caja de los negocios y no se pueden arrastrar con el usuario.
--
--   se borra          perfil, direcciones, avisos, términos, descartes de reseña,
--                     canjes de promo, intentos de OTP, roles y la identidad de
--                     `auth.users` (sesiones e identidades caen en cascada)
--   se anonimiza      el pedido y la carrera de Entregas: TODA columna de nombre,
--                     teléfono, dirección, referencia, coordenadas, GPS, mapa y texto
--                     libre; el log de eventos (`order_event_log`,
--                     `courier_order_events`, `domain_events`) con
--                     `redact_personal_json`; el historial de estados y las notas de
--                     los renglones. El importe y el estado NO se tocan.
--   se desvincula     la reseña (`order_reviews.customer_user_id` = NULL; la FK
--                     `SET NULL` no dispara al borrar `auth.users`, no hay cascada)
--   se queda          la fila de `public.users`, como lápida sin correo ni nombre
--                     (`deleted_at`, `is_active = false`): sostiene la FK de los pedidos
--   se conserva       `customer_strikes`, `customer_incidents`, `reports` y
--                     `address_directory` (antifraude y directorio de la cajera, por
--                     teléfono: recomendación de D-44, a confirmar); la nota y el
--                     comentario de la reseña; `comprobante_prepago_url`.
--   NO se toca aquí   `business_charges` ni ningún saldo: Tindivo no retiene fondos y la
--                     deuda de los negocios no es del cliente.
--
-- NO se borra (devuelve `blocked`, sin tocar nada) a quien tenga: un pedido o carrera en
-- curso; una apelación o devolución abierta; cualquier rol aparte de `customer`.
-- Ninguno de los tres casos está decidido: se bloquea por ser no destructivo y reversible.
--
-- LA CARRERA. Quien ya está autenticado puede estar creando un pedido mientras se borra
-- la cuenta. El `FOR UPDATE` sobre `users` de la RPC y el `FOR SHARE` de
-- `reject_deleted_account` (disparador BEFORE INSERT OR UPDATE en cada tabla de datos del cliente)
-- se esperan entre sí: o el pedido entra primero y la RPC lo ve y bloquea, o la RPC
-- entra primero y el pedido se rechaza contra la lápida. Sin esto el FK aceptaba el
-- insert sobre la lápida y dejaba un pedido ACTIVO con datos personales.
--
-- EVENTOS QUE NO CUELGAN DEL PEDIDO. `domain_events.aggregate_id` no siempre es el pedido:
-- `CashDelivered` (0176) usa el id de la LIQUIDACIÓN y lleva `customerName` en el payload.
-- Por eso se redactan los eventos cuyo aggregate_id es un pedido o carrera del usuario Y los
-- que lo REFERENCIAN dentro del payload (`orderId`, `order_id`, `courierOrderId`, `shortId`).
-- Los importes sobreviven (están en la lista de permitidas); los nombres no.
--
-- GUARD DE UPDATE POR LISTA DE PERMITIDAS. Sobre una fila de una cuenta borrada, un UPDATE
-- solo puede cambiar las columnas OPERATIVAS (estado, caja, liquidación, marcas de tiempo
-- del flujo…) que se declaran por tabla abajo. Cualquier otra columna —incluida una
-- columna nueva que nadie declaró— se rechaza. Antes se enumeraban las personales y se
-- escapaban las notas libres (`business_notes`, `driver_notes`, `cancel_note`…).
--
-- DEADLOCK. Los UPDATE directos de otras rutas sobre `customer_profiles` / `customer_addresses`
-- (p. ej. `/customer/phone/verify`, la barra de direcciones del cliente) toman el
-- `FOR SHARE` del guard sobre `users` y la fila de la tabla en otro orden que esta RPC
-- (`FOR UPDATE` sobre `users`, luego borra esas filas). Si coinciden en la misma ventana,
-- PostgreSQL detecta el abrazo mortal y aborta UNA de las dos transacciones con SQLSTATE
-- 40P01, sin corromper datos. NO se persigue un orden perfecto de candados en todos los
-- caminos: el caso es raro y esos UPDATE directos PUEDEN recibir 40P01 en esa ventana
-- (reintentar es seguro). La ruta `DELETE /customer/account` reintenta 40P01 y 40001
-- (3 intentos, espera corta); ver `withTxRetry` en la API.
--
-- Idempotente: sobre una cuenta ya borrada, la RPC devuelve `already_deleted`.

alter table public.users add column if not exists deleted_at timestamptz;

-- ── Redacción de JSON: LISTA DE PERMITIDAS ───────────────────────────────────
-- Los logs guardan datos libres (`{"reasonText": "Rosa, celular 999…"}`). Una lista de
-- claves PROHIBIDAS siempre se queda corta (un motivo escrito a mano cabe en
-- cualquier clave), así que se invierte: solo sobreviven las claves de abajo (ids,
-- estados, importes, fechas, enums, contadores) y los booleanos. Toda clave nueva
-- queda redactada por defecto hasta que alguien la declare segura aquí.
-- Una clave permitida cuyo valor es un objeto o una lista se recorre con la misma regla.
create or replace function public.redact_personal_json(j jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_safe constant text[] := array[
    -- ids y referencias opacas
    'id', 'shortId', 'orderId', 'orderNumber', 'businessId', 'driverId', 'actorUserId',
    'adminUserId', 'fromDriverId', 'toDriverId', 'reportId', 'reviewId', 'requestId',
    'addressDirectoryId', 'proofPath', 'proof_path',
    -- estados, acciones y enums
    'action', 'actorRole', 'status', 'nextStatus', 'statusAlEditar', 'deliveryMethod',
    'pickupTiming', 'paymentIntent', 'paymentMethod', 'paymentReal', 'deliveryFeeSource',
    'cancelReason', 'cancelReasonDetail', 'reasonCode', 'validationReasonCode',
    'refundStatus', 'appealStatus', 'outcome', 'resolution', 'method', 'channel',
    'context', 'source', 'band', 'oldBand', 'newBand',
    -- importes y medidas
    'orderAmount', 'deliveryFee', 'deliveryFeeCharged', 'newDeliveryFeeCharged',
    'oldDeliveryFeeCharged', 'total', 'totalCharged', 'tindivoCommission',
    'commissionAmount', 'cashAmount', 'yapeAmount', 'clientPaysWith', 'changeToGive',
    'feeAmount', 'refundAmount', 'amount', 'distanceM', 'rating', 'itemCount', 'attempt',
    'minutes', 'minutesToReady', 'minutesWaiting', 'prepTimeMinutes', 'count',
    -- fechas
    'expiresAt', 'notifiedAt', 'confirmedAt', 'cancelledAt', 'updatedAt',
    'arrivedAtCustomerAt', 'remittedAt', 'readyEarlyAt', 'appeal_deadline', 'deliveredAt',
    -- estructuras de números y banderas
    'cambios', 'de', 'a', 'riskFlags'
  ];
  v_out jsonb;
begin
  case jsonb_typeof(j)
    when 'object' then
      select coalesce(jsonb_object_agg(
        e.key,
        case
          when e.key = any (c_safe) then public.redact_personal_json(e.value)
          when jsonb_typeof(e.value) = 'boolean' then e.value
          else to_jsonb('[eliminado]'::text)
        end
      ), '{}'::jsonb)
      into v_out
      from jsonb_each(j) e;
      return v_out;
    when 'array' then
      select coalesce(jsonb_agg(public.redact_personal_json(e.value)), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(j) e;
      return v_out;
    else
      return j;
  end case;
end;
$$;

-- ── Rechazo contra la lápida ─────────────────────────────────────────────────
-- BEFORE INSERT OR UPDATE en cada tabla donde el cliente deja datos.
--   TG_ARGV[0] = la columna que apunta a `users`.
--   TG_ARGV[1] = columnas OPERATIVAS que un UPDATE puede cambiar sobre una cuenta
--                borrada (lista separada por comas; '' = ninguna). LISTA DE PERMITIDAS:
--                si cambia cualquier otra columna (salvo `updated_at`), se rechaza.
-- Un UPDATE que CAMBIA el vínculo hacia una cuenta borrada se trata como un alta.
-- La propia RPC de borrado se salta el guard con `tindivo.deleting_account` = el id
-- del usuario (solo para ese usuario, solo durante su transacción).
create or replace function public.reject_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_user uuid := nullif(v_new ->> tg_argv[0], '')::uuid;
  v_deleted timestamptz;
  v_cols text[];
  v_hint text;
  v_touched boolean := false;
begin
  if v_user is null then
    return new;
  end if;
  if current_setting('tindivo.deleting_account', true) = v_user::text then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (v_new ->> tg_argv[0]) is not distinct from (to_jsonb(old) ->> tg_argv[0]) then
      -- Mismo vínculo: solo pasa si lo ÚNICO que cambia son columnas operativas.
      v_cols := array_append(string_to_array(tg_argv[1], ','), 'updated_at');
      v_touched := (v_new - v_cols) is distinct from (to_jsonb(old) - v_cols);
      if v_touched then
        select string_agg(e.key, ', ') into v_hint from jsonb_each(v_new - v_cols) e
        where e.value is distinct from (to_jsonb(old) - v_cols) -> e.key;
      end if;
      if not v_touched then
        return new;
      end if;
    end if;
  end if;

  -- FOR SHARE espera al `FOR UPDATE` de la RPC y, al despertar, lee la fila ya
  -- actualizada (READ COMMITTED): ve `deleted_at`.
  select u.deleted_at into v_deleted from public.users u where u.id = v_user for share;
  if v_deleted is not null then
    -- El hint nombra las columnas que chocaron (solo nombres, nunca valores).
    raise exception 'cannot write because the account was deleted' using errcode = 'P0001',
      hint = coalesce(v_hint, '');
  end if;
  return new;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('orders', 'customer_user_id',
        'driver_id,status,is_manual,delivery_method,delivery_distance_band,order_amount,delivery_fee,'
        'payment_intent,payment_real,yape_amount,cash_amount,client_pays_with,change_to_give,'
        'yape_confirmed,cash_owed_at_delivery,tindivo_commission,commission_amount,'
        'delivery_fee_charged,delivery_fee_source,change_advanced,comprobante_prepago_url,'
        'prep_time_minutes,estimated_ready_at,appears_in_queue_at,prep_extended_at,'
        'prep_extension_count,ready_early_used,occupancy_slots,urgent_since,assigned_at,'
        'validating_at,pending_acceptance_at,confirmed_at,preparing_at,waiting_driver_at,'
        'heading_at,waiting_at_restaurant_at,picked_up_at,delivered_at,cancelled_at,'
        'cancelled_by,cancel_reason,cancel_reason_detail,tracking_link_sent_at,'
        'tracking_link_sent_by,payment_verified_at,payment_verified_by,payment_proof_status,'
        'rejection_reason_code,rejected_at,rejected_by,requires_validation,validated_at,'
        'validated_by,validation_result,validation_reason_code,validation_context,'
        'proof_attempt,risk_flags,awaiting_payment_at,ready_early_at,cash_settlement_id,'
        'arrived_at_customer_at,queue_notified_at,delivery_location_confirmed_at,'
        'customer_gps_method,customer_gps_validated_at,pickup_timing,ready_for_pickup_at'),
      ('courier_orders', 'customer_user_id',
        'status,driver_id,payer,payment_method,transport_collected_at,fee_amount,distance_m,'
        'is_fragile,weight_confirmed,prepaid_confirmed,ready_in_min,ready_at,accepted_at,'
        'departed_at,arrived_at,picked_up_at,departed_dropoff_at,delivered_at,cancelled_at,'
        'cancel_reason,remitted_at,remittance_confirmed_at,remittance_confirmed_by'),
      ('customer_profiles', 'user_id', ''),
      ('customer_addresses', 'user_id', ''),
      ('push_subscriptions', 'user_id', ''),
      ('terms_acceptance', 'user_id', ''),
      ('order_reviews', 'customer_user_id', ''),
      ('order_review_dismissals', 'customer_user_id', ''),
      ('promo_redemptions', 'customer_user_id', ''),
      ('customer_otp_attempts', 'user_id', '')
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

-- ── Bloqueos ─────────────────────────────────────────────────────────────────
create or replace function public.account_deletion_blockers(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'activeOrders', (
      select count(*) from public.orders o
      where o.customer_user_id = p_user_id
        and o.status not in ('delivered', 'cancelled')
    ),
    'activeCourierOrders', (
      select count(*) from public.courier_orders c
      where c.customer_user_id = p_user_id
        and c.status not in ('delivered', 'cancelled')
    ),
    -- Mismo criterio que `idx_reports_appeal_unresolved`, más la devolución de
    -- prepago que quedó para revisión manual.
    'openMoneyReports', (
      select count(*) from public.reports r
      where r.customer_user_id = p_user_id
        and (
          (r.type = 'rejected_proof_disputed' and (
            r.appeal_status in ('pending', 'in_review')
            or (r.appeal_status = 'approved' and r.refund_status = 'pending')
          ))
          or (r.type = 'prepay_refund_review' and r.status = 'open')
        )
    ),
    'otherRoles', coalesce((
      select jsonb_agg(ur.role::text order by ur.role::text)
      from public.user_roles ur
      where ur.user_id = p_user_id and ur.role <> 'customer'
    ), '[]'::jsonb)
  );
$$;

-- ── El borrado ───────────────────────────────────────────────────────────────
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
  v_short_ids  text[];
  -- Centro de San Jacinto: las carreras de Entregas exigen coordenadas dentro del
  -- pueblo (`co_*_in_town`), así que el punto exacto se sustituye por uno válido.
  c_lat constant numeric := -9.15;
  c_lng constant numeric := -78.28;
  c_gone constant text := 'Cuenta eliminada';
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
  select coalesce(array_agg(short_id), '{}') into v_short_ids from (
    select short_id from public.orders where customer_user_id = p_user_id
    union all
    select short_id from public.courier_orders where customer_user_id = p_user_id
  ) s;

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
  where aggregate_id = any (v_order_ids || v_courier_ids)
     -- Eventos de OTRO agregado que lo referencian (p. ej. `CashDelivered`, de la liquidación).
     or payload ->> 'orderId' = any (v_ref_ids)
     or payload ->> 'order_id' = any (v_ref_ids)
     or payload ->> 'courierOrderId' = any (v_ref_ids)
     or payload ->> 'shortId' = any (v_short_ids);

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

-- Inventario de columnas de unas tablas, para que un test compare lo que existe con lo
-- que el borrado cubre: una columna personal nueva rompe el test hasta que alguien
-- decida qué hacer con ella.
--
-- Las tablas se descubren por llaves foráneas, no por una lista a mano: las que
-- cuelgan (directa o indirectamente) de `orders` y `courier_orders`, las que
-- apuntan directo a `users`, y las que apuntan SIN FK: `customer_otp_attempts` (guarda
-- `user_id`) y `domain_events` (por `aggregate_id` y por ids dentro del payload).
create or replace function public.personal_data_inventory()
returns table (table_name text, column_name text, data_type text)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive walk(rel) as (
    select 'public.orders'::regclass
    union select 'public.courier_orders'::regclass
    union
    select c.conrelid
    from pg_constraint c join walk w on c.confrelid = w.rel
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  ),
  rels as (
    select rel from walk
    union
    select c.conrelid from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.users'::regclass
      and c.connamespace = 'public'::regnamespace
    union select 'public.customer_otp_attempts'::regclass
    union select 'public.domain_events'::regclass
  )
  select k.relname::text, c.column_name::text, c.data_type::text
  from rels
  join pg_class k on k.oid = rels.rel
  join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = k.relname
  order by 1, 2;
$$;

revoke all on function public.personal_data_inventory() from public, anon, authenticated;
grant execute on function public.personal_data_inventory() to service_role;


-- Solo la API (service_role) las llama, con el id de la sesión ya validada.
revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
revoke all on function public.delete_customer_account(uuid) from public, anon, authenticated;
revoke all on function public.redact_personal_json(jsonb) from public, anon, authenticated;
revoke all on function public.reject_deleted_account() from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;
grant execute on function public.delete_customer_account(uuid) to service_role;
grant execute on function public.redact_personal_json(jsonb) to service_role;

comment on function public.delete_customer_account(uuid) is
  'Borrado de cuenta del cliente: anonimiza pedidos y logs, borra lo personal y la identidad. Devuelve status deleted | already_deleted | blocked. Ver 0259.';
