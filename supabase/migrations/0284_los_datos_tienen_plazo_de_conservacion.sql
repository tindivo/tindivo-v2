-- ============================================================================
-- 0284 — los datos tienen plazo de conservación (decisión de Jesús, 2026-11-12)
-- ============================================================================
--
-- La política de privacidad solo puede prometer lo que el sistema hace. Esta migración
-- pone el mecanismo de cada plazo que SÍ se puede aplicar sin cambiar el antifraude:
--
--   1. Reseñas: al borrar la cuenta, la reseña pierde el comentario (queda la nota y
--      las etiquetas, sin autor). `delete_customer_account` es la de 0278 con UNA línea
--      cambiada (la de `order_reviews`). Además, una sola vez, se vacía el comentario de
--      las reseñas de cuentas YA borradas (se las encuentra por el pedido).
--   3. Antifraude, 24 meses desde el hecho o su resolución (lo más reciente):
--      · `customer_incidents` revisados: teléfono → 'eliminado' (la columna es NOT NULL;
--        mismo marcador que 0278 en `courier_orders.requester_phone`), referencia,
--        descripción y `customer_user_id` → NULL.
--      · `reports` cerrados (ni `open`, ni apelación pendiente/en revisión, ni devolución
--        pendiente): teléfono, descripción, nota de resolución, `customer_user_id` y
--        evidencia → NULL. La imagen de la evidencia se borra por la API de Storage ANTES
--        de anular la referencia, salvo que otra fila la siga usando (el comprobante del
--        pedido, otra apelación, una devolución, un reclamo): entonces solo se quita la
--        referencia del reporte y el archivo se queda con quien lo usa.
--        `refund_proof_path` NO se toca: es el comprobante de una devolución de dinero y
--        su CHECK lo exige mientras la devolución conste como completada.
--   4. Restricciones del número levantadas o vencidas: 24 meses desde `lifted_at` o
--      `until` (el más tardío) → se eliminan. Una restricción activa nunca se toca.
--   6. Registros técnicos, 13 meses: `store_events` (desde `created_at`),
--      `push_delivery_log` (desde `at`) y `admin_alerts` resueltas (desde `resolved_at`)
--      → se eliminan.
--
-- NO se implementan aquí (cambian a quién se le exige pago adelantado; ver el informe y
-- `Docs/operacion/retencion-de-datos.md`):
--   · `customer_strikes`: `customer_requires_prepayment`, `customer_contraentrega_blocked`,
--     `refresh_customer_profile_risk` y `create_customer_order` los cuentan por teléfono y
--     por referencia SIN ventana de tiempo.
--   · `address_directory`: `customer_contraentrega_decision` da por confiable a un número
--     con CUALQUIER fila en el directorio.
--   · `phone_assignments`: la misma función usa la asignación terminada de otro dueño
--     para que quien recicla un número no herede la confianza ajena (P5 de 0277).
--
-- Reglas comunes:
--   · Plazos en `app_settings.data_retention` (invariante 10), sin pisar un valor ya
--     existente. Si la clave falta o el valor no es un entero válido, no se toca nada
--     (falla cerrada).
--   · El plazo se cuenta en días de Lima: vence lo que ocurrió ANTES del día de corte
--     (hoy en Lima menos el plazo). Lo ocurrido el mismo día de corte no se toca.
--   · Por lotes con tope (`FOR UPDATE SKIP LOCKED`, nunca toda la tabla de golpe); cada
--     función devuelve cuántas filas tocó.
--   · SECURITY DEFINER, search_path vacío, solo `service_role` (invariante 3, DB-3, DB-4).
--   · Ningún importe, estado ni fecha de negocio cambia (invariante 9). `reports` tiene
--     `touch_updated_at`: su `updated_at` sí registra la anonimización.
-- ============================================================================

insert into public.app_settings (key, value)
values (
  'data_retention',
  '{"customerIncidentsMonths": 24, "reportsMonths": 24, "phoneRestrictionsMonths": 24,
    "storeEventsMonths": 13, "pushDeliveryLogMonths": 13, "adminAlertsMonths": 13}'::jsonb
)
on conflict (key) do nothing;

-- ── 1 · El borrado de cuenta vacía el comentario de sus reseñas ─────────────
-- Copia literal de 0278 salvo la sentencia de `order_reviews`, que ahora también pone
-- `comment = null`. El trigger `trg_reject_deleted_account` de `order_reviews` solo se
-- dispara con `customer_user_id` no nulo, y además esta transacción ya lleva el bypass
-- `tindivo.deleting_account`: la sentencia pasa en el mismo sitio que antes.
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
  v_closed_at  timestamptz;
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

  -- Reseñas: la nota y las etiquetas se quedan, sin autor y sin comentario (0284).
  update public.order_reviews set customer_user_id = null, comment = null
  where customer_user_id = p_user_id;

  -- 0278 · El número verificado se lleva el riesgo de la cuenta, con el mismo plazo
  -- (D-63), y su historia se queda (D-44: antifraude por teléfono): quien lo tome
  -- después empieza sin la confianza de esta cuenta (P5 de 0277). Va antes de borrar
  -- el perfil, porque keep_phone_restrictions lee de ahí el bloqueo y el prepago.
  -- El cierre es el reloj de AHORA, no el `now()` del inicio de la transacción: mientras
  -- el borrado esperaba la libreta, la misma cuenta pudo verificar un número y abrir una
  -- asignación que empieza después (CAX-001). Ya con `users` bloqueado no se abre otra.
  v_closed_at := clock_timestamp();
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
      values (v_phone, p_user_id, v_verified_at, 'verification',
              greatest(v_verified_at, v_closed_at), 'account_deleted');
    end if;
  end if;
  update public.phone_assignments
     set ended_at = greatest(started_at, v_closed_at), end_reason = 'account_deleted'
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

-- Reseñas de cuentas YA borradas antes de esta migración: su autor ya es NULL, así que se
-- las encuentra por el pedido (`orders.customer_user_id` se conserva al borrar la cuenta).
-- Idempotente: la segunda vez no encuentra comentarios. El trigger de `order_reviews` no
-- se dispara (`customer_user_id` ya es NULL).
update public.order_reviews r
set comment = null
from public.orders o
join public.users u on u.id = o.customer_user_id
where r.order_id = o.id
  and r.customer_user_id is null
  and r.comment is not null
  and u.deleted_at is not null;

-- ── Día de corte ────────────────────────────────────────────────────────────
-- Medianoche de Lima del día (hoy en Lima − N meses), con N = data_retention.<p_key>.
-- Vence lo que ocurrió ANTES de ese instante: lo del mismo día de corte se queda.
-- NULL si la clave falta o no es un entero entre 1 y 1200 (falla cerrada).
create or replace function public.retention_cutoff(p_key text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw    jsonb;
  v_months integer;
  v_today  date := (now() at time zone 'America/Lima')::date;
begin
  select s.value -> p_key into v_raw
  from public.app_settings s
  where s.key = 'data_retention';

  if v_raw is null or jsonb_typeof(v_raw) <> 'number' then
    return null;
  end if;
  if (v_raw #>> '{}')::numeric <> trunc((v_raw #>> '{}')::numeric)
     or (v_raw #>> '{}')::numeric < 1
     or (v_raw #>> '{}')::numeric > 1200 then
    return null;
  end if;
  v_months := (v_raw #>> '{}')::integer;

  return ((v_today - make_interval(months => v_months))::date)::timestamp
         at time zone 'America/Lima';
end;
$$;

revoke execute on function public.retention_cutoff(text) from public, anon, authenticated;
grant execute on function public.retention_cutoff(text) to service_role;

-- ── Referencias a archivos ──────────────────────────────────────────────────
-- Una referencia es una RUTA de Storage si no es una URL ni empieza por '/'. Solo una ruta
-- se resuelve contra los buckets privados; una URL apunta a algo que esta purga no
-- controla y se conserva (la fila queda anonimizada en lo demás).
create or replace function public.retention_ref_is_path(p_ref text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_ref is not null
     and btrim(p_ref) <> ''
     and position('://' in p_ref) = 0
     and left(p_ref, 1) <> '/';
$$;

revoke execute on function public.retention_ref_is_path(text) from public, anon, authenticated;
grant execute on function public.retention_ref_is_path(text) to service_role;

-- Objetos de los buckets privados cuyo nombre es exactamente la ruta.
create or replace function public.retention_ref_objects(p_ref text)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where public.retention_ref_is_path(p_ref)
    and o.bucket_id in ('payment-proofs', 'receipts')
    and o.name = p_ref
  order by o.bucket_id, o.name;
$$;

revoke execute on function public.retention_ref_objects(text) from public, anon, authenticated;
grant execute on function public.retention_ref_objects(text) to service_role;

-- ¿Otra fila sigue usando el archivo? Entonces no se borra: solo se suelta la referencia
-- de la fila que vence. `p_source` y `p_id` excluyen a la propia fila.
create or replace function public.retention_ref_shared(p_ref text, p_source text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.orders o where o.comprobante_prepago_url = p_ref)
      or exists (select 1 from public.reports r
                 where r.evidence_url = p_ref and not (p_source = 'reports' and r.id = p_id))
      or exists (select 1 from public.reports r where r.refund_proof_path = p_ref)
      or exists (select 1 from public.fraud_coverage_claims c
                 where c.evidence_url = p_ref
                   and not (p_source = 'fraud_coverage_claims' and c.id = p_id));
$$;

revoke execute on function public.retention_ref_shared(text, text, uuid) from public, anon, authenticated;
grant execute on function public.retention_ref_shared(text, text, uuid) to service_role;

-- ── Marca de «pendiente de borrado» (CAX-001) ───────────────────────────────
-- El borrado en Storage ocurre FUERA de la base (API HTTP), así que ningún candado de fila lo
-- cubre. La garantía es otra: `retention_prepare_delete` toma, en la misma transacción que la
-- comprobación («ninguna otra fila usa la ruta»), un candado consultivo por ruta y deja una
-- marca con un token. Mientras la marca está vigente (1 hora), los triggers de abajo rechazan
-- que otra fila adopte la ruta o que la fila marcada se reabra. El job borra solo los objetos
-- que devuelve ESE precheck (nunca una lista anterior) y `finish_*` exige el token.
create table if not exists public.retention_storage_marks (
  path       text primary key,
  source     text not null check (source in ('reports', 'fraud_coverage_claims')),
  row_id     uuid not null,
  token      uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index if not exists retention_storage_marks_row on public.retention_storage_marks (source, row_id);

alter table public.retention_storage_marks enable row level security;
revoke all on table public.retention_storage_marks from public, anon, authenticated;
grant select, insert, update, delete on table public.retention_storage_marks to service_role;
comment on table public.retention_storage_marks is
  'Rutas de Storage con borrado por plazo de conservación en curso (0284). Solo service_role; sin policies a propósito.';

-- Candado consultivo por ruta: serializa al marcador con quien intenta adoptar la ruta.
create or replace function public.retention_lock_path(p_path text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('retention_path:' || p_path, 0));
$$;

revoke execute on function public.retention_lock_path(text) from public, anon, authenticated;
grant execute on function public.retention_lock_path(text) to service_role;

-- Debe llamarse con la fila ya bloqueada (`FOR UPDATE`) y comprobada como vencida. Devuelve
-- `{token, objects}`: los objetos que ESTA fila puede borrar ahora (vacío si la ruta no es de
-- Storage, si no existe o si otra fila la usa) y el token de la marca (null si no hay nada que borrar).
create or replace function public.retention_prepare_delete(p_source text, p_row_id uuid, p_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token   uuid;
  v_objects jsonb;
begin
  delete from public.retention_storage_marks m where m.created_at < now() - interval '1 hour';
  if not public.retention_ref_is_path(p_ref) then
    return jsonb_build_object('token', null, 'objects', '[]'::jsonb);
  end if;

  perform public.retention_lock_path(p_ref);

  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket, 'path', o.path)
                            order by o.bucket, o.path), '[]'::jsonb)
    into v_objects
  from public.retention_ref_objects(p_ref) o;

  if v_objects = '[]'::jsonb or public.retention_ref_shared(p_ref, p_source, p_row_id) then
    delete from public.retention_storage_marks m
     where m.source = p_source and m.row_id = p_row_id;
    return jsonb_build_object('token', null, 'objects', '[]'::jsonb);
  end if;

  insert into public.retention_storage_marks (path, source, row_id)
  values (p_ref, p_source, p_row_id)
  on conflict (path) do update
    set source = excluded.source, row_id = excluded.row_id,
        token = gen_random_uuid(), created_at = now()
  returning token into v_token;

  return jsonb_build_object('token', v_token, 'objects', v_objects);
end;
$$;

revoke execute on function public.retention_prepare_delete(text, uuid, text) from public, anon, authenticated;
grant execute on function public.retention_prepare_delete(text, uuid, text) to service_role;

-- ¿Sigue vigente la marca que autorizó el borrado de esta ruta para esta fila?
create or replace function public.retention_mark_valid(p_source text, p_row_id uuid, p_ref text, p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null and exists (
    select 1 from public.retention_storage_marks m
    where m.path = p_ref and m.source = p_source and m.row_id = p_row_id
      and m.token = p_token and m.created_at > now() - interval '1 hour'
  );
$$;

revoke execute on function public.retention_mark_valid(text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.retention_mark_valid(text, uuid, text, uuid) to service_role;

create or replace function public.retention_release_mark(p_source text, p_row_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.retention_storage_marks m where m.source = p_source and m.row_id = p_row_id;
$$;

revoke execute on function public.retention_release_mark(text, uuid) from public, anon, authenticated;
grant execute on function public.retention_release_mark(text, uuid) to service_role;

-- Trigger: ninguna fila adopta una ruta marcada. `tg_argv[0]` es la columna con la ruta.
-- Solo lee: no cambia ningún valor de la fila. Las funciones de trigger no son llamables por clientes.
create or replace function public.retention_guard_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := to_jsonb(new) ->> tg_argv[0];
begin
  if v_ref is null or not public.retention_ref_is_path(v_ref) then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_ref is not distinct from (to_jsonb(old) ->> tg_argv[0]) then
    return new;
  end if;
  perform public.retention_lock_path(v_ref);
  if exists (select 1 from public.retention_storage_marks m
             where m.path = v_ref and m.created_at > now() - interval '1 hour') then
    raise exception 'retention_pending_delete'
      using errcode = '55006', detail = 'ese archivo se está borrando por plazo de conservación';
  end if;
  return new;
end;
$$;

-- Trigger: la fila marcada no se reabre mientras su archivo se borra. `tg_argv[0]` es la tabla.
create or replace function public.retention_guard_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.retention_storage_marks m
             where m.source = tg_argv[0] and m.row_id = old.id
               and m.created_at > now() - interval '1 hour') then
    raise exception 'retention_pending_delete'
      using errcode = '55006', detail = 'esta fila está en borrado por plazo de conservación';
  end if;
  return new;
end;
$$;

revoke execute on function public.retention_guard_ref() from public, anon, authenticated;
revoke execute on function public.retention_guard_row() from public, anon, authenticated;

drop trigger if exists trg_retention_guard_orders_proof on public.orders;
create trigger trg_retention_guard_orders_proof
  before insert or update of comprobante_prepago_url on public.orders
  for each row execute function public.retention_guard_ref('comprobante_prepago_url');

drop trigger if exists trg_retention_guard_reports_evidence on public.reports;
create trigger trg_retention_guard_reports_evidence
  before insert or update of evidence_url on public.reports
  for each row execute function public.retention_guard_ref('evidence_url');

drop trigger if exists trg_retention_guard_reports_refund on public.reports;
create trigger trg_retention_guard_reports_refund
  before insert or update of refund_proof_path on public.reports
  for each row execute function public.retention_guard_ref('refund_proof_path');

drop trigger if exists trg_retention_guard_reports_row on public.reports;
create trigger trg_retention_guard_reports_row
  before update of status, appeal_status, refund_status, resolved_at, refund_completed_at on public.reports
  for each row
  when (old.status is distinct from new.status
        or old.appeal_status is distinct from new.appeal_status
        or old.refund_status is distinct from new.refund_status
        or old.resolved_at is distinct from new.resolved_at
        or old.refund_completed_at is distinct from new.refund_completed_at)
  execute function public.retention_guard_row('reports');

-- ── 6 · Registros técnicos (13 meses) ───────────────────────────────────────
create or replace function public.purge_old_store_events(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('storeEventsMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  delete from public.store_events e
  where e.id in (
    select x.id from public.store_events x
    where x.created_at < v_cutoff
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.purge_old_store_events(integer) from public, anon, authenticated;
grant execute on function public.purge_old_store_events(integer) to service_role;

create or replace function public.purge_old_push_delivery_log(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('pushDeliveryLogMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  delete from public.push_delivery_log l
  where l.id in (
    select x.id from public.push_delivery_log x
    where x."at" < v_cutoff
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.purge_old_push_delivery_log(integer) from public, anon, authenticated;
grant execute on function public.purge_old_push_delivery_log(integer) to service_role;

-- Una alerta sin resolver nunca vence.
create or replace function public.purge_old_admin_alerts(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('adminAlertsMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  delete from public.admin_alerts a
  where a.id in (
    select x.id from public.admin_alerts x
    where x.resolved_at is not null
      and x.resolved_at < v_cutoff
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.purge_old_admin_alerts(integer) from public, anon, authenticated;
grant execute on function public.purge_old_admin_alerts(integer) to service_role;

-- ── 4 · Restricciones del número levantadas o vencidas (24 meses) ───────────
-- Activa = sin levantar y sin vencer (`until` NULL o futuro): `customer_is_blocked` y
-- `customer_requires_prepayment` solo miran esas, así que borrar las otras no cambia el
-- riesgo de nadie. Se cuenta desde el final más tardío (`greatest` ignora los NULL).
create or replace function public.purge_old_phone_restrictions(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('phoneRestrictionsMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  delete from public.phone_restrictions r
  where r.id in (
    select x.id from public.phone_restrictions x
    where (x.lifted_at is not null or (x."until" is not null and x."until" <= now()))
      and greatest(x.lifted_at, x."until") < v_cutoff
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.purge_old_phone_restrictions(integer) from public, anon, authenticated;
grant execute on function public.purge_old_phone_restrictions(integer) to service_role;

-- ── 3 · Incidentes revisados (24 meses) ─────────────────────────────────────
-- Sin revisar (`reviewed_at` NULL) es un incidente abierto: no se toca. No cambia `is_strike`,
-- así que `trg_incident_apply_strike` (AFTER UPDATE OF is_strike) no se dispara.
create or replace function public.anonymize_old_customer_incidents(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('customerIncidentsMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  update public.customer_incidents i set
    customer_phone = 'eliminado',
    delivery_reference = null,
    description = null,
    customer_user_id = null
  where i.id in (
    select x.id from public.customer_incidents x
    where x.reviewed_at is not null
      and greatest(x.created_at, x.reviewed_at) < v_cutoff
      and (x.customer_phone <> 'eliminado'
           or x.delivery_reference is not null
           or x.description is not null
           or x.customer_user_id is not null)
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.anonymize_old_customer_incidents(integer) from public, anon, authenticated;
grant execute on function public.anonymize_old_customer_incidents(integer) to service_role;

-- ── 3 · Reportes cerrados (24 meses), con su imagen ─────────────────────────
-- Abierto = `status` open, apelación pendiente o en revisión, o devolución aprobada sin
-- completar (el mismo criterio de `account_deletion_blockers` y algo más amplio). Se cuenta
-- desde lo más reciente entre el hecho, la resolución y la devolución. Ya anonimizado =
-- sin nada personal y sin una ruta de Storage pendiente.
create or replace function public.retention_report_due(p_report public.reports, p_cutoff timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_cutoff is not null
     and not coalesce(
           p_report.status = 'open'
           or p_report.appeal_status in ('pending', 'in_review')
           or (p_report.appeal_status = 'approved' and p_report.refund_status = 'pending'),
           false)
     and greatest(p_report.created_at, p_report.resolved_at, p_report.refund_completed_at) < p_cutoff
     and (p_report.customer_phone is not null
          or p_report.description is not null
          or p_report.resolution_note is not null
          or p_report.customer_user_id is not null
          or public.retention_ref_is_path(p_report.evidence_url));
$$;

revoke execute on function public.retention_report_due(public.reports, timestamptz) from public, anon, authenticated;
grant execute on function public.retention_report_due(public.reports, timestamptz) to service_role;

-- Reportes vencidos por cursor estable (`id`), con los archivos que hay que borrar ANTES de
-- cerrar cada uno: solo los que ninguna otra fila usa.
create or replace function public.list_report_retention_due(p_limit integer, p_after_id uuid default null)
returns table (row_id uuid, objects jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('reportsMonths');
begin
  if v_cutoff is null then
    return;
  end if;
  return query
  select r.id,
         coalesce((
           select jsonb_agg(jsonb_build_object('bucket', o.bucket, 'path', o.path)
                            order by o.bucket, o.path)
           from public.retention_ref_objects(r.evidence_url) o
           where not public.retention_ref_shared(r.evidence_url, 'reports', r.id)
         ), '[]'::jsonb)
  from public.reports r
  where public.retention_report_due(r, v_cutoff)
    and (p_after_id is null or r.id > p_after_id)
  order by r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke execute on function public.list_report_retention_due(integer, uuid) from public, anon, authenticated;
grant execute on function public.list_report_retention_due(integer, uuid) to service_role;

-- Se llama ANTES de tocar Storage, con la fila bloqueada. Devuelve
-- `{status, token, objects}`: status ok | not_due | not_found. El job borra SOLO `objects` (calculado
-- aquí, bajo candado y con la marca ya puesta) y devuelve el `token` a `finish_report_retention`.
drop function if exists public.report_retention_precheck(uuid);
create or replace function public.report_retention_precheck(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'token', null, 'objects', '[]'::jsonb);
  end if;
  if not public.retention_report_due(v_report, public.retention_cutoff('reportsMonths')) then
    perform public.retention_release_mark('reports', p_report_id);
    return jsonb_build_object('status', 'not_due', 'token', null, 'objects', '[]'::jsonb);
  end if;
  return jsonb_build_object('status', 'ok')
         || public.retention_prepare_delete('reports', p_report_id, v_report.evidence_url);
end;
$$;

revoke execute on function public.report_retention_precheck(uuid) from public, anon, authenticated;
grant execute on function public.report_retention_precheck(uuid) to service_role;

-- Cierra un reporte: anonimiza SOLO si su archivo propio ya no está en Storage y, si el job
-- borró uno, la marca de ese borrado sigue vigente (`p_token`).
-- Devuelve: anonymized | ref_kept (la evidencia es una URL y se conserva) | not_due |
-- not_found | object_remains (el borrado en Storage no ocurrió: no se toca nada) |
-- stale (la marca ya no es la que autorizó el borrado: no se toca nada).
drop function if exists public.finish_report_retention(uuid);
create or replace function public.finish_report_retention(p_report_id uuid, p_token uuid default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report   public.reports%rowtype;
  v_keep_ref boolean;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    return 'not_found';
  end if;
  if not public.retention_report_due(v_report, public.retention_cutoff('reportsMonths')) then
    perform public.retention_release_mark('reports', p_report_id);
    return 'not_due';
  end if;

  if public.retention_ref_is_path(v_report.evidence_url) then
    perform public.retention_lock_path(v_report.evidence_url);
    if exists (select 1 from public.retention_ref_objects(v_report.evidence_url))
       and not public.retention_ref_shared(v_report.evidence_url, 'reports', p_report_id) then
      return 'object_remains';
    end if;
    if p_token is not null
       and not public.retention_mark_valid('reports', p_report_id, v_report.evidence_url, p_token) then
      return 'stale';
    end if;
  end if;

  v_keep_ref := v_report.evidence_url is not null
                and not public.retention_ref_is_path(v_report.evidence_url);

  update public.reports set
    customer_phone = null,
    description = null,
    resolution_note = null,
    customer_user_id = null,
    evidence_url = case when v_keep_ref then evidence_url else null end
  where id = p_report_id;

  perform public.retention_release_mark('reports', p_report_id);
  return case when v_keep_ref then 'ref_kept' else 'anonymized' end;
end;
$$;

revoke execute on function public.finish_report_retention(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finish_report_retention(uuid, uuid) to service_role;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  v_name   text;
  n        int;
  v_secdef boolean;
  v_cfg    text[];
begin
  foreach v_name in array array[
    'delete_customer_account', 'retention_cutoff', 'retention_ref_is_path',
    'retention_ref_objects', 'retention_ref_shared', 'purge_old_store_events',
    'purge_old_push_delivery_log', 'purge_old_admin_alerts', 'purge_old_phone_restrictions',
    'anonymize_old_customer_incidents', 'retention_report_due', 'list_report_retention_due',
    'report_retention_precheck', 'finish_report_retention', 'retention_lock_path',
    'retention_prepare_delete', 'retention_mark_valid', 'retention_release_mark'
  ] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if n <> 1 then
      raise exception '0284: se esperaba UNA sola % y hay %', v_name, n;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if not v_secdef then
      raise exception '0284: % no es SECURITY DEFINER', v_name;
    end if;
    if v_cfg is distinct from array['search_path=""'] then
      raise exception '0284: % no quedó con search_path vacío (%)', v_name, v_cfg;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_name
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute')
           or not has_function_privilege('service_role', p.oid, 'execute'))
    ) then
      raise exception '0284: permisos de % incorrectos (solo service_role)', v_name;
    end if;
  end loop;
  foreach v_name in array array['retention_guard_ref', 'retention_guard_row'] loop
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if not coalesce(v_secdef, false) or v_cfg is distinct from array['search_path=""'] then
      raise exception '0284: % sin SECURITY DEFINER o sin search_path vacío', v_name;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_name
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
    ) then
      raise exception '0284: % ejecutable por un cliente', v_name;
    end if;
  end loop;
  if not (select c.relrowsecurity from pg_class c
           where c.oid = 'public.retention_storage_marks'::regclass) then
    raise exception '0284: retention_storage_marks sin RLS';
  end if;
  if has_table_privilege('anon', 'public.retention_storage_marks', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.retention_storage_marks', 'select,insert,update,delete') then
    raise exception '0284: un cliente puede tocar retention_storage_marks';
  end if;
  if not exists (select 1 from public.app_settings where key = 'data_retention') then
    raise exception '0284: falta app_settings.data_retention';
  end if;
end
$check$;
