-- Rollback de 0281: el envoltorio vuelve al cuerpo de la 0251 y se quita la columna.
-- OJO: borrar la columna pierde la plataforma de los pedidos hechos desde la 0281 (solo
-- métricas; ninguna regla la lee). Si se quiere conservar, omite la sección 2.

-- ── 1. El envoltorio de la 0251, literal ────────────────────────────────────
create or replace function public.create_order_idempotently(
  p_user_id uuid,
  p_scope text,
  p_key uuid,
  p_request_hash text,
  p_args jsonb
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_claimed int;
  v_tries int := 0;
  v_existing record;
  v_data jsonb;
begin
  if p_user_id is null or p_key is null or p_request_hash is null or p_args is null then
    raise exception 'idempotency_invalid_request' using errcode = 'P0001';
  end if;
  if p_scope is null or p_scope not in ('create_order', 'create_courier_order') then
    raise exception 'idempotency_invalid_scope' using errcode = 'P0001';
  end if;

  -- La clave solo crea pedidos DE SU DUEÑO.
  if (p_args ->> 'p_customer_user_id') is distinct from p_user_id::text then
    raise exception 'idempotency_user_mismatch' using errcode = '42501';
  end if;

  -- Reclamación en BUCLE: reclamar → si existe, leer CON bloqueo → si desapareció
  -- (la purga la borró entre medias) o está vencida, volver a reclamar. Un
  -- segundo INSERT a pelo, sin ON CONFLICT, daba 23505 (500) cuando dos
  -- llamadas entraban a la vez por esa rama tras una purga.
  loop
    v_tries := v_tries + 1;
    if v_tries > 5 then
      raise exception 'idempotency_contention' using errcode = 'P0001';
    end if;

    insert into public.creation_idempotency (user_id, scope, key, request_hash)
    values (p_user_id, p_scope, p_key, p_request_hash)
    on conflict (user_id, scope, key) do nothing;
    get diagnostics v_claimed = row_count;
    exit when v_claimed = 1;

    -- FOR UPDATE (no SHARE: dos llamadas con un SHARE cada una y ninguna pudiendo
    -- tomar el bloqueo exclusivo para borrar la vencida se interbloquean): si la
    -- purga está borrando esta fila, espera a que confirme y entonces `found` es
    -- falso; si otra llamada la está creando, ya confirmó (el INSERT de arriba
    -- esperó por ella).
    select request_hash, response, expires_at into v_existing
      from public.creation_idempotency
      where user_id = p_user_id and scope = p_scope and key = p_key
      for update;
    if found then
      if v_existing.expires_at < now() then
        -- Vencida pero aún sin purgar: no vale como replay (su respuesta
        -- puede ser el `{}` de una purga a medias). Se borra y se reclama de nuevo.
        delete from public.creation_idempotency
          where user_id = p_user_id and scope = p_scope and key = p_key
            and expires_at < now();
      else
        if v_existing.request_hash <> p_request_hash then
          raise exception 'idempotency_conflict' using errcode = 'IK409';
        end if;
        return jsonb_build_object('replayed', true, 'data', v_existing.response);
      end if;
    end if;
  end loop;

  if p_scope = 'create_order' then
    v_data := public.create_customer_order(
      p_business_id := (p_args ->> 'p_business_id')::uuid,
      p_customer_user_id := p_user_id,
      p_delivery_method := (p_args ->> 'p_delivery_method')::public.delivery_method,
      p_payment_intent := (p_args ->> 'p_payment_intent')::public.payment_intent,
      p_customer_name := p_args ->> 'p_customer_name',
      p_customer_phone := p_args ->> 'p_customer_phone',
      p_items := p_args -> 'p_items',
      p_delivery_address := p_args ->> 'p_delivery_address',
      p_delivery_reference := p_args ->> 'p_delivery_reference',
      p_delivery_lat := (p_args ->> 'p_delivery_lat')::numeric,
      p_delivery_lng := (p_args ->> 'p_delivery_lng')::numeric,
      p_source := coalesce((p_args ->> 'p_source')::public.order_source, 'customer_pwa'::public.order_source),
      p_client_pays_with := (p_args ->> 'p_client_pays_with')::numeric,
      p_customer_gps_lat := (p_args ->> 'p_customer_gps_lat')::double precision,
      p_customer_gps_lng := (p_args ->> 'p_customer_gps_lng')::double precision,
      p_customer_gps_accuracy_m := (p_args ->> 'p_customer_gps_accuracy_m')::double precision,
      p_customer_gps_distance_to_center_km := (p_args ->> 'p_customer_gps_distance_to_center_km')::numeric,
      p_customer_gps_method := p_args ->> 'p_customer_gps_method',
      p_customer_notes := p_args ->> 'p_customer_notes',
      p_delivery_accuracy_m := (p_args ->> 'p_delivery_accuracy_m')::integer,
      p_delivery_confirmed_at := (p_args ->> 'p_delivery_confirmed_at')::timestamptz,
      p_pickup_timing := p_args ->> 'p_pickup_timing'
    );
  else
    v_data := public.create_courier_order(
      p_customer_user_id := p_user_id,
      p_requester_name := p_args ->> 'p_requester_name',
      p_requester_phone := p_args ->> 'p_requester_phone',
      p_directory_business_id := (p_args ->> 'p_directory_business_id')::uuid,
      p_origin_name := p_args ->> 'p_origin_name',
      p_origin_phone := p_args ->> 'p_origin_phone',
      p_origin_lat := (p_args ->> 'p_origin_lat')::numeric,
      p_origin_lng := (p_args ->> 'p_origin_lng')::numeric,
      p_origin_reference_text := p_args ->> 'p_origin_reference_text',
      p_destination_name := p_args ->> 'p_destination_name',
      p_destination_phone := p_args ->> 'p_destination_phone',
      p_destination_lat := (p_args ->> 'p_destination_lat')::numeric,
      p_destination_lng := (p_args ->> 'p_destination_lng')::numeric,
      p_destination_reference_text := p_args ->> 'p_destination_reference_text',
      p_item_description := p_args ->> 'p_item_description',
      p_is_fragile := (p_args ->> 'p_is_fragile')::boolean,
      p_ready_in_min := (p_args ->> 'p_ready_in_min')::int,
      p_payer := (p_args ->> 'p_payer')::public.courier_payer,
      p_weight_confirmed := (p_args ->> 'p_weight_confirmed')::boolean,
      p_prepaid_confirmed := (p_args ->> 'p_prepaid_confirmed')::boolean,
      p_utm_source := p_args ->> 'p_utm_source',
      p_driver_note := p_args ->> 'p_driver_note'
    );
  end if;

  update public.creation_idempotency
    set response = v_data,
        resource_id = nullif(v_data ->> 'id', '')::uuid
    where user_id = p_user_id and scope = p_scope and key = p_key;

  -- COMPATIBILIDAD DE DESPLIEGUE Y DE ROLLBACK. La API anterior solo conoce
  -- `idempotency_keys`: si un reintento de una creación hecha por la API NUEVA
  -- llegara a la VIEJA (rollback del despliegue), duplicaría el pedido. Se deja
  -- también allí la fila `completed`, en la misma transacción. Si la API anterior
  -- había dejado la clave `reserved` (misma persona, mismo payload), se COMPLETA:
  -- con un `do nothing` seguiría `reserved` y tras un rollback daría 409 para
  -- siempre. Una fila de otro usuario o de otro payload no se toca (la PK de esa
  -- tabla no lleva usuario).
  -- ORDEN DE BLOQUEO: siempre `creation_idempotency` primero y `idempotency_keys`
  -- después, igual que `prune_creation_idempotency` (0252); así no hay ciclo.
  -- Se retira cuando ya no pueda volver atrás ninguna API anterior (24 h de TTL).
  insert into public.idempotency_keys
    (key, scope, user_id, request_hash, status, response_status, response_body)
  values
    (p_key, p_scope, p_user_id, p_request_hash, 'completed', 201,
     jsonb_build_object('data', v_data))
  on conflict (key, scope) do update
    set status = 'completed',
        response_status = 201,
        response_body = excluded.response_body,
        expires_at = now() + interval '24 hours'
    where public.idempotency_keys.user_id = excluded.user_id
      and public.idempotency_keys.request_hash = excluded.request_hash
      and public.idempotency_keys.status = 'reserved';

  return jsonb_build_object('replayed', false, 'data', v_data);
end;
$$;

revoke execute on function public.create_order_idempotently(uuid, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_order_idempotently(uuid, text, uuid, text, jsonb)
  to service_role;

-- ── 2. La columna ───────────────────────────────────────────────────────────
alter table public.orders drop column if exists client_platform;
