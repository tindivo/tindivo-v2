-- =============================================================================
-- 0226 · Algunos platos solo van al mediodia
--
-- Idempotente (add column if not exists / create or replace). Rollback en
-- supabase/rollbacks/0226_some_dishes_only_go_at_midday.rollback.sql
-- =============================================================================
--
-- EL PROBLEMA, MEDIDO EN PROD
-- La Florencia sirve dos cartas. Su horario lo dice desde el primer dia:
--
--     lun-vie   18:00-23:00/23:30   (una sola, de noche)
--     sabado    11:00-15:00  +  18:00-23:00   (DOS turnos)
--     domingo   11:00-15:00          (solo mediodia)
--
-- El menu no podia decirlo, y el coste esta escrito en `menu_items`: sus 11
-- platos de PESCADOS Y MARISCOS (ceviches, chaufa marino, duo y trio marino) y
-- los 2 de RECOMENDACION DEL CHEF (arroz con pato, osobuco) llevan desde el
-- 7-8 de septiembre de 2026 con `is_available = false`. O sea INVISIBLES LAS 24
-- HORAS DE LOS 7 DIAS, incluido el mediodia del sabado en que si se sirven,
-- porque encenderlos a las 11:00 y apagarlos a las 15:00 son 26 toques de
-- switch por fin de semana y nadie los da. Son 13 platos que el cliente no ha
-- podido pedir nunca.
--
-- QUE AÑADE ESTA MIGRACION
-- Tres columnas en `menu_items` que describen CUANDO se sirve un plato, y una
-- funcion que contesta si ahora mismo toca. Las tres nacen en NULL, que
-- significa «siempre que el local este abierto»: los 51 platos de La Florencia y
-- los de los otros tres negocios no cambian de comportamiento, no hay backfill
-- y no hay nada que revertir si esto no gustara.
--
-- DOS HECHOS DISTINTOS, DOS COLUMNAS DISTINTAS
-- `is_available` significa «se acabo» y lo pone la cajera a mano. La franja
-- significa «no es su turno» y es una regla. La disponibilidad efectiva es la
-- AND de las dos, y se DERIVA en cada lectura: no hay proceso que escriba nada.
--
-- Por eso esto NO es un cron, aunque `pg_cron` este instalado y «a las 15:00
-- apaga estos 13 platos» sea la via obvia. Un cron que escribe `is_available`
-- le borra a la cajera el «se acabo el ceviche» que puso a las 12:30 en cuanto
-- cambia el turno; y cuando falla, falla en silencio y la carta queda mal hasta
-- que llama un cliente.
--
-- LA REGLA VIVE EN DOS SITIOS, A SABIENDAS
-- `public.menu_item_in_window` (aqui) y `isWithinWindow`
-- (packages/contracts/src/menu-availability.ts) calculan lo mismo. Es el mismo
-- reparto que ya tiene abierto/cerrado: el TS pinta la carta y la apaga al
-- cruzar la hora sin recargar —por eso la API manda la REGLA y no el
-- resultado—, y el SQL es la red de seguridad de una pestaña vieja. Los dos
-- lados se cubren con el mismo corpus de casos.
--
-- CONVENCION DE DIAS: 0=Lunes..6=Domingo, la de `business_schedule`. NO es la de
-- `extract(dow)` de Postgres (0=Domingo) ni la de `Date.getDay()`.
-- =============================================================================

alter table public.menu_items
  add column if not exists available_days smallint[],
  add column if not exists available_from time,
  add column if not exists available_to   time;

comment on column public.menu_items.available_days is
  'Dias en que se sirve el plato. 0=Lunes..6=Domingo (la convencion de business_schedule, NO la de extract(dow)). NULL o vacio = todos los dias.';
comment on column public.menu_items.available_from is
  'Hora de inicio de la franja en que se sirve. NULL = desde que el local abre. Con available_to <= available_from la franja cruza medianoche, igual que un turno.';
comment on column public.menu_items.available_to is
  'Hora de fin de la franja, EXCLUSIVA: semantica [from, to), la misma de los turnos. NULL = hasta que el local cierra.';

-- -----------------------------------------------------------------------------
-- ¿Se sirve este plato en el instante `p_at`?
--
-- Gemelo SQL de `isWithinWindow`. Pura: no lee ninguna tabla, asi que se puede
-- probar con valores a mano.
--
-- FAIL-OPEN EN TODO. Un array vacio, los siete dias marcados, un dia fuera de
-- rango o media franja (from sin to) hacen que el plato SE VEA. Esconder un
-- plato por un dato roto es una venta perdida que nadie llega a diagnosticar.
--
-- `p_grace_min` estira SOLO el cierre: cubre al cliente que pulso «Pedir» a las
-- 14:59:50 y cuyo pedido entra a las 15:00:02. No estira la apertura, porque
-- pedir ceviche a las 10:50 no es un accidente que haya que perdonar — la
-- cocina todavia no lo tiene.
-- -----------------------------------------------------------------------------
create or replace function public.menu_item_in_window(
  p_days smallint[],
  p_from time,
  p_to time,
  p_at timestamptz default now(),
  p_grace_min int default 0
) returns boolean
language sql
stable
set search_path = ''
as $function$
  with norm as (
    select
      -- Los dias que restringen de verdad, o NULL si no discriminan. Un array
      -- vacio y los siete dias dan lo mismo que NULL: asi un array vacio
      -- escrito por error no deja un plato sin ningun dia valido, y por tanto
      -- invisible para siempre.
      (select case when count(*) = 0 or count(*) = 7 then null
                   else array_agg(d order by d) end
         from (select distinct u as d
                 from unnest(coalesce(p_days, '{}'::smallint[])) u
                where u between 0 and 6) s) as days,
      -- Dia 0=Lunes..6=Domingo y minuto del instante, en America/Lima: el
      -- servidor puede correr en otra zona. `isodow` da 1=Lunes..7=Domingo.
      ((extract(isodow from p_at at time zone 'America/Lima')::int + 6) % 7)::smallint as day_idx,
      extract(hour from p_at at time zone 'America/Lima')::int * 60
        + extract(minute from p_at at time zone 'America/Lima')::int as minutes,
      -- Hacen falta las DOS horas. Con media franja no se sabe cuando acaba, y
      -- se prefiere ignorar la hora y respetar los dias a inventarse un final.
      case when p_from is null or p_to is null then null
           else extract(hour from p_from)::int * 60 + extract(minute from p_from)::int
      end as start_min,
      case when p_from is null or p_to is null then null
           else (case when p_to <= p_from
                        -- Cruza medianoche: +1 dia. Incluye p_to = p_from, que
                        -- son 24 horas. Misma regla que `crossesMidnight`.
                        then extract(hour from p_to)::int * 60 + extract(minute from p_to)::int + 1440
                      else extract(hour from p_to)::int * 60 + extract(minute from p_to)::int
                 end)
                - (extract(hour from p_from)::int * 60 + extract(minute from p_from)::int)
      end as span
  )
  select case
    -- Sin dias y sin horas no hay restriccion: el plato se sirve siempre.
    when n.days is null and n.span is null then true
    -- Solo dias: cualquier hora de esos dias.
    when n.span is null then n.day_idx = any(n.days)
    -- La ventana pertenece al dia en que EMPIEZA, igual que un turno: un sabado
    -- 22:00-02:00 cubre la madrugada del domingo aunque el domingo no este
    -- marcado. De ahi el paso por ayer (back = 1), que tambien recoge un margen
    -- de gracia que se pasa de medianoche.
    else exists (
      select 1
      from (values (0), (1)) as b(back)
      where (n.days is null or ((n.day_idx - b.back + 7) % 7)::smallint = any(n.days))
        and n.minutes + b.back * 1440 >= n.start_min
        and n.minutes + b.back * 1440 < n.start_min + n.span + coalesce(p_grace_min, 0)
    )
  end
  from norm n;
$function$;

comment on function public.menu_item_in_window(smallint[], time, time, timestamptz, int) is
  'Gemelo SQL de isWithinWindow (packages/contracts/src/menu-availability.ts). Fail-open: un dato roto deja ver el plato.';

-- -----------------------------------------------------------------------------
-- Lo mismo pero «ahora» y con el margen de gracia de `app_settings.timers`.
--
-- El margen vive en `timers` porque desde la 0174 todos los minutos
-- configurables viven ahi y en ningun otro sitio.
-- -----------------------------------------------------------------------------
create or replace function public.menu_item_orderable_now(
  p_days smallint[],
  p_from time,
  p_to time
) returns boolean
language sql
stable
set search_path = ''
as $function$
  select public.menu_item_in_window(
    p_days, p_from, p_to, now(),
    coalesce(
      (select (value ->> 'shiftAvailabilityGraceMinutes')::int
         from public.app_settings where key = 'timers'),
      10)
  );
$function$;

comment on function public.menu_item_orderable_now(smallint[], time, time) is
  'menu_item_in_window a now() con el margen de gracia de app_settings.timers.shiftAvailabilityGraceMinutes (default 10).';

-- Superficie cerrada (patron 0009 / 0204). Las dos las llaman funciones
-- SECURITY DEFINER que son de postgres, asi que nadie mas necesita EXECUTE —
-- y los default privileges de Supabase lo reparten si no se revoca a mano.
revoke all on function public.menu_item_in_window(smallint[], time, time, timestamptz, int)
  from public, anon, authenticated;
revoke all on function public.menu_item_orderable_now(smallint[], time, time)
  from public, anon, authenticated;
grant execute on function public.menu_item_in_window(smallint[], time, time, timestamptz, int)
  to service_role;
grant execute on function public.menu_item_orderable_now(smallint[], time, time)
  to service_role;

-- Margen de gracia del guard, en minutos. `do update` a proposito y no
-- `do nothing`: `timers` YA existe desde la 0006, asi que un do nothing no
-- añadiria la clave nueva. Se fusiona para no pisar el resto del objeto.
update public.app_settings
   set value = value || '{"shiftAvailabilityGraceMinutes": 10}'::jsonb
 where key = 'timers'
   and not (value ? 'shiftAvailabilityGraceMinutes');

-- -----------------------------------------------------------------------------
-- `create_customer_order` con el guard de franja. El resto del cuerpo es la
-- definicion que dejo la 0220, copiada tal cual: este bloque solo AÑADE el
-- `if` de arriba.
-- -----------------------------------------------------------------------------
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

  -- 0220: cuándo dijo el cliente que pasa por su recojo, y el atajo booleano.
  v_pickup_timing text;
  v_pickup_now boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  -- ── RECOJO: CUÁNDO VIENE, PREGUNTADO Y NO INFERIDO (0220) ─────────────
  -- No sale de `p_source` ni de ningún parámetro de campaña. Un QR pegado en el
  -- mostrador se fotografía y se comparte por WhatsApp en diez segundos, así
  -- que «entró por el póster» no dice NADA sobre dónde está parado quien pide.
  -- Lo dice el cliente, con un toque, y de ahí cuelga todo lo demás.
  --
  -- EL DEFAULT ES 'later', QUE ES EL LADO CARO. Un llamador que omita el
  -- argumento cae en el camino con GPS, guard de contraentrega y `validando`,
  -- o sea el que ya existía. Si el default fuera 'now', olvidarse del argumento
  -- REGALARÍA la exención por presencia física, que es justo lo que el bloque
  -- de más abajo existe para no regalar.
  v_pickup_timing := case
    when p_delivery_method <> 'pickup' then null
    when p_pickup_timing in ('now', 'later') then p_pickup_timing
    else 'later'
  end;
  v_pickup_now := (v_pickup_timing = 'now');

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
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up',
      -- 0220: una bolsa esperando en el mostrador es un pedido ABIERTO. Sin
      -- esta línea, quien no pasa a recoger puede seguir pidiendo al mismo
      -- restaurante y acumular comida hecha que nadie va a llevarse — que es
      -- justo el escenario que el guard de 0105 existe para cerrar.
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
      if v_pickup_now then
        -- ── RECOJO «AHORA»: LA GARANTÍA ES LA PERSONA, NO EL DATO (0220) ────
        -- Este es el único camino del sistema donde un cliente sin ninguna
        -- historia paga contraentrega sin GPS y sin llamada. La razón es que
        -- aquí no hay nada fiado: NADIE COCINA hasta que la cajera acepta el
        -- pedido, y para aceptarlo tiene delante a quien lo hizo. La
        -- verificación es un humano mirando a otro humano, y eso es MÁS fuerte
        -- que una coordenada — el GPS de un navegador se falsifica sin root;
        -- estar de pie en el mostrador, no.
        --
        -- Y mentir aquí no le cuesta nada al negocio: quien dice «ahora» y no
        -- aparece deja un pedido que nadie tocó, y que se autocancela solo por
        -- la ventana de aceptación que ya corre para todos.
        --
        -- LO QUE ESTA RAMA NO PERDONA: el `risk_blocked` de arriba corta antes
        -- de llegar aquí. Un cliente con strikes no compra a crédito por estar
        -- de pie: la sanción de DECISIONS §8 es de la cuenta, no del canal.
        v_risk_flags := v_risk_flags || jsonb_build_object('pickupNowPresence', true);
      elsif not public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method) then
        raise exception 'Pago adelantado requerido para primer pedido.'
          using errcode = 'P0001';
      else
        -- Sin historial, pero el GPS dice San Jacinto: contraentrega permitida,
        -- con la misma llamada de validación que ya paga cualquier cliente
        -- nuevo. El GPS es falsificable; la llamada es la salvaguarda.
        --
        -- Vale igual para un recojo «más tarde»: ahí la comida se hace con
        -- nadie delante, exactamente como en un delivery, así que se le pide
        -- exactamente lo mismo.
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'new_customer_local_gps');
        v_risk_flags := v_risk_flags || jsonb_build_object('newCustomerLocalGps', true);
      end if;
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
    delivery_coordinates_accuracy_m, delivery_location_confirmed_at,
    pickup_timing
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

    -- FRANJA HORARIA DEL PLATO (0226). SOLO PARA EL CANAL DEL CLIENTE.
    --
    -- 462 de los 527 pedidos de prod entran por `business_manual`: los
    -- teclea la cajera, que tiene la cocina delante. Si a las 15:05 queda
    -- ceviche, lo vende, y el servidor no esta en posicion de discutirselo.
    -- Este guard es la red de seguridad de una PESTAÑA VIEJA del cliente:
    -- la carta que se sirvio a las 14:00 del sabado no puede seguir
    -- pidiendo ceviche el martes a las 21:00.
    --
    -- El mensaje no detalla la franja a proposito: la frase humana
    -- («Solo sab y dom, de 11:00 a 15:00») la compone `describeWindow` en
    -- el cliente, y duplicar aqui ese formateo seria una tercera copia de
    -- la misma regla. El cliente ve el detalle en la card y en la bolsa;
    -- esto solo tiene que impedir el pedido.
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
      if v_pickup_now then
        -- `validando` SIGNIFICA «LA CAJERA LLAMA POR TELÉFONO» (DECISIONS §8),
        -- y no se llama a quien está al otro lado del mostrador. Las señales
        -- que llevaron hasta aquí NO se pierden: `requires_validation`,
        -- `validation_reason_code` y `risk_flags` se guardan igual, y la
        -- tarjeta del tablero las enseña. Lo que cambia es quién resuelve la
        -- duda: no una llamada, sino la persona que lo tiene delante y que
        -- todavía no ha aceptado el pedido.
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

-- -----------------------------------------------------------------------------
-- `search_catalog` deja de devolver platos fuera de su franja. El resto del
-- cuerpo es la definicion que dejo la 0052, copiada tal cual.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_catalog(p_query text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_norm text;      -- query normalizada SIN escapar (para similarity/ranking)
  v_esc text;       -- query con los comodines de LIKE escapados
  v_terms text[];   -- términos escapados (el más largo primero, máx 5)
  v_patterns text[];
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_businesses jsonb;
  v_items jsonb;
begin
  v_norm := public.f_unaccent(lower(trim(coalesce(p_query, ''))));
  if length(v_norm) < 2 then
    return jsonb_build_object('businesses', '[]'::jsonb, 'items', '[]'::jsonb);
  end if;

  -- Escape de comodines de LIKE. El orden importa: el backslash PRIMERO, o los
  -- backslashes que introducen los dos replace siguientes se volverían a escapar.
  v_esc := replace(v_norm, chr(92), chr(92) || chr(92));
  v_esc := replace(v_esc, '%', chr(92) || '%');
  v_esc := replace(v_esc, '_', chr(92) || '_');

  -- Términos >=2 chars, el más largo primero: v_terms[1] es el LIKE indexable
  -- más selectivo; el resto entra como filtro AND vía LIKE ALL (multi-palabra:
  -- "pollo brasa" encuentra "Pollo a la brasa").
  select array_agg(t order by length(t) desc, ord) into v_terms
  from (
    select t, ord
    from unnest(regexp_split_to_array(v_esc, '[[:space:]]+')) with ordinality as u(t, ord)
    where length(t) >= 2
    order by length(t) desc, ord
    limit 5
  ) s;
  if v_terms is null then
    return jsonb_build_object('businesses', '[]'::jsonb, 'items', '[]'::jsonb);
  end if;
  select array_agg('%' || t || '%') into v_patterns from unnest(v_terms) as t;

  -- Negocios (mismos filtros de publicación que /public/businesses).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'slug', t.slug,
      'name', t.name,
      'tagline', t.tagline,
      'accent_color', t.accent_color,
      'logo_url', t.logo_url,
      'primary_capability', t.primary_capability,
      'estimated_eta_min', t.estimated_eta_min,
      'estimated_eta_max', t.estimated_eta_max
    ) order by t.sim desc, t.name), '[]'::jsonb)
  into v_businesses
  from (
    select b.id, b.slug, b.name, b.tagline, b.accent_color, b.logo_url, b.primary_capability,
           b.estimated_eta_min, b.estimated_eta_max,
           extensions.similarity(
             public.f_unaccent(lower(b.name || ' ' || coalesce(b.tagline, ''))), v_norm) as sim
    from public.businesses b
    where b.publishes_catalog and b.is_active and not b.is_blocked
      and public.f_unaccent(lower(b.name || ' ' || coalesce(b.tagline, ''))) like ('%' || v_terms[1] || '%')
      and public.f_unaccent(lower(b.name || ' ' || coalesce(b.tagline, ''))) like all (v_patterns)
    order by sim desc, b.name
    limit v_limit
  ) t;

  -- Platos disponibles de negocios publicados, en categorías activas (paridad
  -- con el menú público). La pausa (accepting_orders_until) NO filtra aquí:
  -- es transitoria y la página del negocio gestiona el bloqueo.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'business_id', t.business_id,
      'business_slug', t.business_slug,
      'business_name', t.business_name,
      'name', t.name,
      'description', t.description,
      'base_price', t.base_price,
      'image_url', t.image_url,
      'image_hue', t.image_hue
    ) order by t.sim desc, t.name), '[]'::jsonb)
  into v_items
  from (
    select mi.id, mi.business_id, b.slug as business_slug, b.name as business_name,
           mi.name, mi.description, mi.base_price, mi.image_url, mi.image_hue,
           extensions.similarity(
             public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))), v_norm) as sim
    from public.menu_items mi
    join public.businesses b
      on b.id = mi.business_id
     and b.publishes_catalog and b.is_active and not b.is_blocked
    join public.menu_categories mc
      on mc.id = mi.category_id and mc.is_active
    where mi.is_available and mi.deleted_at is null
      -- Fuera de su franja el plato no se busca (0226). Sin margen de
      -- gracia: el margen existe para no tumbar un pedido ya empezado,
      -- no para ofrecer un plato diez minutos despues de su turno.
      and public.menu_item_in_window(
            mi.available_days, mi.available_from, mi.available_to, now(), 0)
      and public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))) like ('%' || v_terms[1] || '%')
      and public.f_unaccent(lower(mi.name || ' ' || coalesce(mi.description, ''))) like all (v_patterns)
    order by sim desc, mi.name
    limit v_limit
  ) t;

  return jsonb_build_object('businesses', v_businesses, 'items', v_items);
end;
$function$;
