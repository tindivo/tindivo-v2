-- =============================================================================
-- 0211 · El primer pedido también puede ser del pueblo
-- =============================================================================
--
-- POR QUÉ. `customer_trusted_for_contraentrega` (0171, cláusula (3) ensanchada
-- por 0182) solo mira HISTORIAL: ¿esta cuenta, este teléfono, o este teléfono en
-- el directorio ya tienen algo que avale contraentrega? Un cliente de CERO
-- historial —su primer pedido de verdad, sin cuenta previa, sin manual de la
-- cajera, sin fila en el directorio— siempre cae en "pago adelantado
-- obligatorio" (0057/0171), sin importar que esté físicamente parado en San
-- Jacinto pidiendo desde su casa. Eso es correcto como default, pero deja fuera
-- al caso legítimo más común de un piloto que recién arranca: el vecino que
-- todavía no le ha comprado nada a Tindivo.
--
-- QUÉ SEÑAL SE AGREGA, Y QUÉ NO ES.
--   El GPS EN VIVO del cliente al momento de pedir (`p_customer_gps_lat/lng`,
--   captura que YA existe desde 0044 para antifraude — "dónde estaba parado el
--   cliente al pedir"), si cae dentro del polígono de cobertura de San Jacinto
--   Y viene de un método con coordenada real (`gps_high_accuracy` o
--   `gps_low_accuracy` — NUNCA `manual_skip_prepaid`/`failed`, que no traen
--   sensor), es evidencia de que el cliente es del pueblo.
--
--   NO es la misma señal que `compra_previa`, y NO recibe el mismo trato.
--   `compra_previa` prueba una relación pasada (una entrega, o una fila de
--   directorio) y habilita contraentrega LIBRE. El GPS es una lectura del
--   INSTANTE, y un navegador la falsifica sin root con una app de
--   mock-location. Tratarlas igual habría regalado contraentrega sin fricción
--   en un primer pedido spoofeado — el mismo hueco que el guard de "cliente
--   nuevo siempre prepago o llamada" (0057/0171) existe para cerrar. Por eso:
--
--     compra_previa = Sí          -> contraentrega LIBRE (sin cambios)
--     compra_previa = No, GPS=SJ  -> contraentrega, pero ENTRA A `validando`
--                                    (la cajera llama, igual que cualquier
--                                    cliente nuevo hoy — no es fricción nueva,
--                                    es la misma que ya paga sin GPS)
--     compra_previa = No, GPS≠SJ  -> pago adelantado obligatorio (sin cambios)
--
--   El riesgo (2+ strikes / `blocked_until`) sigue mandando ANTES que
--   cualquiera de las dos señales, sin excepción. Ver DECISIONS.md §8.
--
-- POR QUÉ TRES FUNCIONES NUEVAS Y NO TOCAR LA FIRMA DE `create_customer_order`.
--   `create_customer_order` NO necesita parámetros nuevos: `p_customer_gps_lat`,
--   `p_customer_gps_lng` y `p_customer_gps_method` YA viajan desde 0044. Por
--   eso este `CREATE OR REPLACE` conserva la firma de 21 argumentos de 0207
--   carácter por carácter — nada de `DROP FUNCTION` ni riesgo de sobrecarga
--   (§2.9 AGENTS.md).
--
--   `customer_trusted_for_contraentrega(uuid)` seguía devolviendo un boolean
--   plano: "confío" o "no confío", sin decir POR QUÉ no confía. Para poder
--   aplicar el GPS solo al caso "no hay historial" y NUNCA al caso "hay
--   riesgo", hacía falta que alguna función supiera distinguir los dos motivos.
--   En vez de tocar esa función (la llaman `create_customer_order` Y el
--   wrapper del checkout, `current_customer_trusted_for_contraentrega`), se
--   extrae su cuerpo a una nueva `customer_contraentrega_decision`, que
--   devuelve 'trusted' | 'risk_blocked' | 'no_history', y la vieja función pasa
--   a ser un wrapper de una línea (`= 'trusted'`). CERO callers rotos: mismo
--   nombre, misma firma, mismo resultado para los dos casos que ya cubría.
--
-- DE DÓNDE SALE "SAN JACINTO". Se reusa `point_in_coverage_polygon` (0064,
-- ensanchada a polígono en 0161) — el MISMO polígono que ya usa el gate duro de
-- la dirección de entrega. Cero geometría nueva, cero constante mágica.
--
-- ROLLBACK: supabase/rollbacks/0211_the_first_order_can_be_local_too.rollback.sql
-- =============================================================================


-- ── A · El motivo, no solo el veredicto ──────────────────────────────────────
-- Mismo cuerpo que `customer_trusted_for_contraentrega` (0182) carácter por
-- carácter, salvo que cada `return true`/`return false` se vuelve un motivo.
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

COMMENT ON FUNCTION public.customer_contraentrega_decision(uuid) IS
  'Motivo detrás de customer_trusted_for_contraentrega: trusted | risk_blocked | '
  'no_history. Existe para que 0211 pueda aplicar el crédito de GPS SOLO al '
  'caso no_history, nunca al risk_blocked. Ver DECISIONS.md §8.';

-- Mismo riesgo que la función que reemplaza en parte: uuid arbitrario como
-- parámetro la vuelve un oráculo sobre cuentas ajenas si se expone.
REVOKE EXECUTE ON FUNCTION public.customer_contraentrega_decision(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_contraentrega_decision(uuid) TO service_role;


-- ── B · El wrapper booleano de siempre, ahora derivado de (A) ───────────────
-- Mismo nombre, misma firma, mismo resultado para 'trusted'/no-'trusted'.
-- create_customer_order y current_customer_trusted_for_contraentrega no se
-- tocan: siguen llamando a esto y no notan el cambio interno.
CREATE OR REPLACE FUNCTION public.customer_trusted_for_contraentrega(p_customer_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT public.customer_contraentrega_decision(p_customer_user_id) = 'trusted';
$fn$;

COMMENT ON FUNCTION public.customer_trusted_for_contraentrega(uuid) IS
  'true si el cliente puede pagar contraentrega SIN validación. Desde 0211, es '
  'un wrapper de customer_contraentrega_decision(uuid) = ''trusted''. Un '
  '''no_history'' con GPS en SJ da false aquí a propósito: sigue necesitando '
  'la llamada de la cajera. Ver current_customer_contraentrega_outcome.';

REVOKE EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) TO service_role;


-- ── C · ¿Esa coordenada es San Jacinto, y viene de un sensor de verdad? ─────
CREATE OR REPLACE FUNCTION public.customer_gps_in_coverage(
  p_lat double precision,
  p_lng double precision,
  p_method text
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  -- 'manual_skip_prepaid'/'failed' no traen coordenada real (0148): sin
  -- sensor, no hay nada que verificar y no cuentan como "está en SJ".
  SELECT
    p_lat IS NOT NULL
    AND p_lng IS NOT NULL
    AND p_method IN ('gps_high_accuracy', 'gps_low_accuracy')
    AND public.point_in_coverage_polygon(p_lat::numeric, p_lng::numeric);
$fn$;

COMMENT ON FUNCTION public.customer_gps_in_coverage(double precision, double precision, text) IS
  'true si la coordenada es de un sensor real (no manual_skip_prepaid/failed) y '
  'cae en el polígono de cobertura de San Jacinto (point_in_coverage_polygon, '
  '0064/0161). Usada por 0211 para el crédito de GPS en clientes sin historial.';

-- No es SECURITY DEFINER ni mira ninguna tabla: solo reusa point_in_coverage_polygon
-- (STABLE, sin RLS) y compara texto. No hay superficie que revocar por seguridad,
-- pero se mantiene cerrado a anon/authenticated por consistencia con sus vecinos.
REVOKE EXECUTE ON FUNCTION public.customer_gps_in_coverage(double precision, double precision, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_gps_in_coverage(double precision, double precision, text) TO service_role;


-- ── D · El wrapper del checkout: lo que la pantalla de pago necesita saber ──
-- Sin parámetro de A PROPÓSITO salvo el GPS: la pregunta que el navegador
-- puede hacer sigue siendo "¿yo?" (auth.uid()), igual que 0171/0182.
CREATE OR REPLACE FUNCTION public.current_customer_contraentrega_outcome(
  p_customer_gps_lat double precision DEFAULT NULL::double precision,
  p_customer_gps_lng double precision DEFAULT NULL::double precision,
  p_customer_gps_method text DEFAULT NULL::text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
declare
  v_decision text;
begin
  v_decision := public.customer_contraentrega_decision(auth.uid());

  if v_decision = 'no_history'
     and public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method)
  then
    return 'local_review';
  end if;

  return v_decision; -- 'trusted' | 'risk_blocked' | 'no_history'
end $fn$;

COMMENT ON FUNCTION public.current_customer_contraentrega_outcome(double precision, double precision, text) IS
  'trusted (contraentrega libre) | local_review (contraentrega, entra a '
  'validando) | risk_blocked | no_history (pago adelantado). Para auth.uid(). '
  'Sin sesión, customer_contraentrega_decision(null) da no_history. Ver 0211.';

-- OBLIGATORIO (0100/0171): los default privileges de Supabase no bastan.
REVOKE EXECUTE ON FUNCTION public.current_customer_contraentrega_outcome(double precision, double precision, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_customer_contraentrega_outcome(double precision, double precision, text) TO authenticated, service_role;


-- ── E · El guard de create_customer_order: aplica el crédito de GPS ─────────
-- Cuerpo idéntico a 0207 salvo el bloque señalado más abajo y la nueva
-- declaración `v_contraentrega_decision`. Misma firma de 21 argumentos: sin
-- DROP FUNCTION, sin riesgo de sobrecarga (§2.9 AGENTS.md).
CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text, p_customer_notes text DEFAULT NULL::text, p_delivery_accuracy_m integer DEFAULT NULL::integer, p_delivery_confirmed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
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
  v_redemption_id uuid;
  v_promo_applied boolean := false;
  v_fee_source text := 'system';
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  -- B.1: Guard explícito para pending_mixed.
  -- El canal B2C no acepta este método: no hay cajera que coordine las dos partes.
  if p_payment_intent = 'pending_mixed' then
    raise exception 'El pago mixto no está disponible en el canal de cliente. Elige efectivo, Yape/Plin o prepago.'
      using errcode = 'P0001';
  end if;

  -- GUARD: un solo pedido activo por cliente + negocio.
  select o.id, o.short_id, o.status into v_active_id, v_active_short_id, v_active_status
  from public.orders o
  where o.customer_user_id = p_customer_user_id
    and o.business_id = p_business_id
    and o.status in (
      'validando', 'pending_acceptance', 'awaiting_payment', 'confirmed', 'preparing',
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'
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

  if public.customer_is_blocked(p_customer_user_id, p_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE TELÉFONO VERIFICADO (WhatsApp OTP)
  if not exists (
    select 1 from public.customer_profiles
    where user_id = p_customer_user_id
    and phone_verified_at is not null
  ) then
    raise exception 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE CONTRAENTREGA: exige historial de entregas, O (0211) un cliente
  -- sin historial pero geolocalizado en San Jacinto — ese caso SÍ entra, pero
  -- fuerza `validando` más abajo (v_requires_validation). El riesgo
  -- ('risk_blocked') nunca pasa por el crédito de GPS: corta siempre. Ver
  -- DECISIONS.md §8 y la cabecera de 0211.
  if p_payment_intent in ('pending_cash', 'pending_yape') then
    v_contraentrega_decision := public.customer_contraentrega_decision(p_customer_user_id);

    if v_contraentrega_decision = 'risk_blocked' then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    elsif v_contraentrega_decision = 'no_history' then
      if not public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method) then
        raise exception 'Pago adelantado requerido para primer pedido.'
          using errcode = 'P0001';
      end if;
      -- Sin historial, pero el GPS dice San Jacinto: contraentrega permitida,
      -- con la misma llamada de validación que ya paga cualquier cliente
      -- nuevo. El GPS es falsificable; la llamada es la salvaguarda.
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'new_customer_local_gps');
      v_risk_flags := v_risk_flags || jsonb_build_object('newCustomerLocalGps', true);
    end if;
    -- 'trusted': contraentrega libre, sin marcar nada adicional.
  end if;

  if p_delivery_method = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Coordenadas de entrega obligatorias para delivery' using errcode = 'P0001';
    end if;

    -- Validar cobertura
    if not public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) then
      raise exception 'Dirección fuera de la zona de reparto establecida para San Jacinto' using errcode = 'P0001';
    end if;

    -- Validar GPS vs Dirección
    -- 0148: `manual_skip_prepaid` ENTRA AQUI, igual que `failed`.
    --
    -- Los dos significan lo mismo: NO HAY POSICION. El cliente denego el
    -- permiso, el GPS no fijo, o pulso la salida de emergencia de
    -- `GeoBlockView` ("no puedo dar mi ubicacion, pago por adelantado").
    -- Solo `failed` estaba exento, asi que `manual_skip_prepaid` caia en el
    -- raise de abajo y el pedido moria con un 422 -- justo el camino que la
    -- app ofrece para RECUPERARSE de un fallo de GPS
    -- (`use-checkout-actions.ts:67` y `:96`).
    --
    -- La contradiccion estaba dentro de esta misma funcion: doce lineas mas
    -- abajo, `if p_customer_gps_method in ('failed', 'manual_skip_prepaid')`
    -- ya trataba a los dos como pareja para marcar `gpsFallbackPrepaid`. Un
    -- lado los rechazaba y el otro contaba con ellos.
    --
    -- El bloque entero se salta con razon: lo unico que hay dentro, ademas
    -- del raise, es la comparacion de distancia GPS-vs-direccion, y sin
    -- coordenadas no hay nada que comparar.
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
    -- El recojo no tiene banda: el cliente va al local. Escribir 'near' seria
    -- meter un dato falso en los reportes (misma decision que 0126).
    v_delivery_fee := 0;
    v_band := null;
  else
    -- LA BANDA SALE DEL PUNTO, NO DE UN LITERAL (0162).
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
    delivery_coordinates_accuracy_m, delivery_location_confirmed_at
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system',
    left(nullif(btrim(regexp_replace(coalesce(p_customer_notes, ''), '\s+', ' ', 'g')), ''), 200),
    nullif(greatest(coalesce(p_delivery_accuracy_m, 0), 0), 0),
    p_delivery_confirmed_at
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

  -- ── PROMO DE LANZAMIENTO: ENVÍO GRATIS (0187) ──────────────────────────────
  -- POR QUÉ AQUÍ, y no justo tras el insert del pedido: el lock del tope se
  -- sostiene hasta el COMMIT, así que todo lo que quede por debajo entra en la
  -- sección crítica. Bajarlo por debajo del bucle de ítems saca de ahí las N
  -- consultas de menu_items y los inserts de líneas y modificadores, que es la
  -- parte más cara y la que más varía con el tamaño del carrito.
  --
  -- Y no puede ir más abajo: las validaciones de pago que vienen a continuación
  -- leen `v_delivery_fee`, que es exactamente lo que esta promo cambia.
  if p_delivery_method = 'delivery' and v_delivery_fee > 0 then
    -- MUTEX DEL TOPE GLOBAL.
    -- No se puede hacer `select count(*) ... for update`: Postgres lo rechaza
    -- con "FOR UPDATE is not allowed with aggregate functions". Y aunque se
    -- pudiera, bloquear filas EXISTENTES no impide que otra transacción INSERTE
    -- una nueva, que es justo la carrera a cerrar. El candado tiene que estar
    -- sobre algo que todos los competidores toquen: la fila de configuración.
    select value into v_promo
      from public.app_settings
     where key = 'promo_free_delivery'
       for update;

    -- CONFIG AUSENTE = NO HAY PROMO, dicho explícitamente.
    -- Sin este `if found`, el caso funcionaría igual por propagación de NULL
    -- (v_promo es jsonb: `NULL ->> 'active'` da NULL y el if no entra), pero
    -- eso es implícito y se rompe la próxima vez que alguien reordene el bloque.
    if found then
      v_promo_code   := v_promo ->> 'code';
      v_promo_active := coalesce((v_promo ->> 'active')::boolean, false);
      v_promo_max    := (v_promo ->> 'max_redemptions')::int;

      -- POLARIDAD POSITIVA, SIEMPRE.
      -- Cada condición dice "aplicar solo si consta que sí". Escrita al revés
      -- ("saltar si consta que no"), un campo NULL en la config —un JSON editado
      -- a medias desde el panel— abriría la promo SIN TECHO en vez de cerrarla.
      -- Con `v_taken < v_max` y v_max NULL no se entra: no aplica. Con
      -- `v_taken >= v_max` tampoco se entraría... y se aplicaría sin límite.
      if v_promo_active
         and v_promo_code is not null
         and v_promo_max is not null
         and public.current_service_date()
               between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date
      then
        -- El conteo se DERIVA del ledger de redenciones, no se acumula en un
        -- contador. Misma lección que 0124 con balance_due: un contador que
        -- sube y baja se desincroniza el día que una fila entre o salga por un
        -- camino no previsto, y entonces el tope publicitado miente hacia el
        -- lado caro. `released` no cuenta: cancelar devuelve el cupo.
        select count(*) into v_promo_taken
          from public.promo_redemptions
         where promo_code = v_promo_code
           and status in ('reserved', 'redeemed');

        if v_promo_taken < v_promo_max then
          -- El teléfono sale del PERFIL VERIFICADO, nunca de p_customer_phone,
          -- que el cliente elige libre. Misma disciplina que 0171.
          select cp.phone into v_verified_phone
            from public.customer_profiles cp
           where cp.user_id = p_customer_user_id
             and cp.phone_verified_at is not null;

          if v_verified_phone is not null then
            -- Dos definiciones de "¿era nuevo?", las dos guardadas en crudo:
            --   prior_delivered_count  entregas de v2 de esta cuenta O de su
            --                          teléfono verificado (las que tomó la
            --                          cajera cuentan: son del mismo humano).
            --   had_delivery_history   la definición ancha de 0171/0182, que
            --                          además incluye el directorio del v1.
            -- En el piloto las dos dan números muy distintos. Guardar el dato
            -- crudo evita atar el análisis a una sola hoy.
            select count(*) into v_prior_delivered
              from public.orders o
             where o.status = 'delivered'
               and (o.customer_user_id = p_customer_user_id
                    or o.customer_phone = v_verified_phone);

            v_had_history := public.customer_trusted_for_contraentrega(p_customer_user_id);

            -- `on conflict do nothing` SIN CONFLICT TARGET. No es un descuido:
            -- sin target arbitra contra TODAS las restricciones únicas, así que
            -- cubre a la vez el índice por cuenta y el de teléfono, en la misma
            -- inserción especulativa. Con target cubriría SOLO ese índice y una
            -- colisión contra el otro levantaría unique_violation (23505),
            -- abortando la transacción y tumbando el pedido entero en vez de
            -- cobrarle el envío.  NO AÑADIR EL TARGET.
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

            -- Con do-nothing y conflicto, v_redemption_id queda NULL (no es
            -- INTO STRICT, no levanta excepción). Eso es cómo se sabe si entró.
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

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount + v_delivery_fee > v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'El total con envio (S/ %) pasa de S/ %, asi que el pago debe ser adelantado.',
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00'),
      to_char(v_threshold, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- R1: el monto declarado debe cubrir el total
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- B.3: R2 y R3 — umbrales de billete y vuelto
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null then
    select (value #>> '{}')::numeric into v_max_bill from public.app_settings where key = 'max_cash_bill';
    v_max_bill := coalesce(v_max_bill, 100);

    -- El techo de vuelto lo pone la caja de esta noche, no una constante. Si la
    -- cajera no declaró nada, `effective_max_change` devuelve el global de
    -- siempre, así que el comportamiento sin declaración es idéntico al de ayer.
    v_max_change := public.effective_max_change(p_business_id);

    -- R2: el billete declarado no puede superar el máximo
    if p_client_pays_with > v_max_bill then
      raise exception 'El billete máximo aceptado es S/%. Usa un billete menor o paga con Yape/Plin.', v_max_bill
        using errcode = 'P0001';
    end if;

    -- R3: el vuelto requerido no puede superar el máximo
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
    v_status := 'pending_acceptance';
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
    delivery_fee = v_delivery_fee,
    delivery_fee_source = v_fee_source,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      -- B.2: round() simple, sin greatest(0,...).
      -- R1 ya garantiza que p_client_pays_with >= total; greatest ocultaba el problema.
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2)
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
    'total', v_order_amount + v_delivery_fee,
    'promoApplied', v_promo_applied
  );
end;
$function$;

-- Grants tal como en 0207: misma firma, mismos permisos.
REVOKE ALL ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz) TO service_role;
