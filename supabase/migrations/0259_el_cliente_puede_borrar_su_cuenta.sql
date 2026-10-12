-- 0259 · El cliente puede borrar su cuenta (MV5, Apple 5.1.1(v) y Google «Account deletion»)
--
-- Diseño: Docs/trabajo/movil/07-publicacion-tiendas.md §8. PROPUESTA: toca datos
-- personales y la retención está en D-44 (abierta). No se aplica a `tindivo-prod`
-- sin la revisión de Jesús y de Codex.
--
-- «Borrar la cuenta» = ANONIMIZAR y DESACTIVAR, en una sola transacción, porque
-- `orders.customer_user_id` y `courier_orders.customer_user_id` son NO ACTION: los
-- pedidos son la caja de los negocios y no se pueden arrastrar con el usuario.
--
--   se borra          perfil, direcciones, avisos, términos, descartes de reseña,
--                     canjes de promo, intentos de OTP, roles y la identidad de
--                     `auth.users` (sesiones e identidades caen en cascada)
--   se anonimiza      el pedido (nombre, teléfono, dirección, referencia, mapa,
--                     coordenadas, GPS, notas del cliente) y la carrera de Entregas
--                     (los datos de las personas); el importe y el estado NO se tocan
--   se queda          la fila de `public.users`, como lápida sin correo ni nombre
--                     (`is_active = false`): sostiene la FK de los pedidos
--   se conserva       `customer_strikes`, `customer_incidents`, `reports` y
--                     `address_directory` (antifraude y directorio de la cajera,
--                     por teléfono: recomendación de D-44, a confirmar);
--                     `order_reviews` (nota; el autor ya es NULL por la FK)
--   NO se toca aquí   `business_charges` ni ningún saldo: Tindivo no retiene fondos
--                     y la deuda de los negocios no es del cliente.
--                     Los comprobantes de `payment-proofs` (plazo de D-44 abierto).
--
-- NO se borra (devuelve `blocked`, sin tocar nada) a quien tenga:
--   · un pedido o una carrera en curso;
--   · una apelación o una devolución abierta (hay dinero de por medio);
--   · cualquier rol aparte de `customer` (negocio, motorizado, admin).
-- Ninguno de los tres casos está decidido: se bloquea porque es lo no destructivo
-- y reversible. Ver la pregunta abierta en el PR.
--
-- Idempotente: `delete_customer_account` sobre una cuenta ya borrada devuelve
-- `already_deleted`.

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
  -- Centro de San Jacinto: las carreras de Entregas exigen coordenadas dentro del
  -- pueblo (`co_*_in_town`), así que el punto exacto se sustituye por uno válido.
  c_lat constant numeric := -9.15;
  c_lng constant numeric := -78.28;
  c_gone constant text := 'Cuenta eliminada';
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if not v_user.is_active and v_user.email like 'deleted-%@deleted.tindivo.invalid' then
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
    address_directory_id = null
  where customer_user_id = p_user_id;
  get diagnostics v_orders = row_count;

  -- Entregas: los datos de quien pidió y de quien recibe. El origen solo se
  -- anonimiza si NO es un negocio del directorio.
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
    origin_phone = case when directory_business_id is null then null else origin_phone end,
    origin_name = case when directory_business_id is null then c_gone else origin_name end,
    origin_lat = case when directory_business_id is null then c_lat else origin_lat end,
    origin_lng = case when directory_business_id is null then c_lng else origin_lng end,
    origin_reference_text =
      case when directory_business_id is null then 'Dato eliminado' else origin_reference_text end
  where customer_user_id = p_user_id;
  get diagnostics v_courier = row_count;

  delete from public.customer_addresses where user_id = p_user_id;
  delete from public.customer_profiles where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.terms_acceptance where user_id = p_user_id;
  delete from public.order_review_dismissals where customer_user_id = p_user_id;
  delete from public.promo_redemptions where customer_user_id = p_user_id;
  delete from public.customer_otp_attempts where user_id = p_user_id;
  delete from public.user_roles where user_id = p_user_id;

  -- La lápida: sin correo ni nombre, desactivada.
  update public.users set
    email = 'deleted-' || p_user_id::text || '@deleted.tindivo.invalid',
    full_name = null,
    is_active = false
  where id = p_user_id;

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

-- Solo la API (service_role) la llama, con el id de la sesión ya validada.
revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
revoke all on function public.delete_customer_account(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;
grant execute on function public.delete_customer_account(uuid) to service_role;

comment on function public.delete_customer_account(uuid) is
  'Borrado de cuenta del cliente: anonimiza pedidos, borra lo personal y la identidad. Devuelve status deleted | already_deleted | blocked. Ver 0259.';
