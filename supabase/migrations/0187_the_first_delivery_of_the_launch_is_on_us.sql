-- =============================================================================
-- 0187 · La primera entrega del lanzamiento la pagamos nosotros
--
-- Idempotente. Rollback en
-- supabase/rollbacks/0187_the_first_delivery_of_the_launch_is_on_us.rollback.sql
-- Spec: Docs/spec/spec-promo-envio-gratis-ago2026.md
-- =============================================================================
--
-- QUÉ ES
-- Promo de lanzamiento: un envío gratis por cliente, del martes 25 al viernes 28
-- de agosto de 2026. Aplica solo a pedidos online con delivery. Los manuales de
-- la cajera, el recojo en local y los negocios en modo catálogo quedan fuera.
--
-- LA HORA DE CORTE NO SE INVENTA
-- La ventana se compara con `current_service_date()` (0154), la jornada
-- operativa que arranca a las 05:00 de Lima. Así "fin de operación del viernes"
-- significa el sábado 29 a las 05:00: un pedido tomado a las 00:40 del sábado
-- sigue siendo la jornada del viernes y entra. Es la misma definición de día que
-- ya usan la caja y las liquidaciones; una hora nueva habría sido una tercera.
--
-- LO QUE NO SE TOCA, Y POR QUÉ NO HACE FALTA
--   · `business_charges`. `generate_delivery_charges` (0124) ya hace
--     `if v_delivery_fee > 0 then insert`, así que con envío 0 NO nace cargo de
--     delivery y el de comisión (S/1.50) nace igual. Cero deuda para el negocio
--     y comisión intacta, sin tocar una línea del módulo financiero.
--     NO se inserta una fila de S/0: `business_charges.amount` tiene
--     `CHECK (amount > 0)`, y sobre todo esa tabla es el ledger de lo que el
--     NEGOCIO debe. El coste de la promo lo asume Tindivo, que igual le paga al
--     motorizado. La auditoría de la promo vive en `promo_redemptions`.
--   · `create_business_manual_order`. Es otra RPC. La exclusión B2B sale gratis
--     por construcción; no hay guard que escribir.
--   · `max_cash_bill`, `max_change`, `prepay_threshold`. Ninguna regla cambia.
--     Lo que cambia es su ENTRADA: el total del pedido baja, así que un pedido
--     de S/79 + S/2 que hoy exige prepago deja de exigirlo. Decidido a
--     propósito (spec §7.3): las reglas miran el dinero efectivamente expuesto.
--
-- EL TOPE GLOBAL Y SU CANDADO
-- `max_redemptions` acota la exposición total. El chequeo tiene que ser atómico
-- con la reserva, y NO se puede hacer con `select count(*) ... for update`:
-- Postgres rechaza FOR UPDATE sobre agregados, y bloquear filas existentes no
-- impediría que otra transacción INSERTE una nueva, que es la carrera a cerrar.
-- Se bloquea la fila `app_settings.promo_free_delivery`, que es el recurso que
-- todos los competidores tocan. Ver la sección D.
--
-- CÓMO SE GENERÓ LA SECCIÓN D
-- El cuerpo de `create_customer_order` NO se escribió a mano. Se extrajo el de
-- 0185 —verificado byte a byte contra el `pg_get_functiondef` vivo en prod,
-- md5 323b4269fe92be7c762b4d9d085e434d, sobrecarga única confirmada— y se le
-- aplicaron cuatro sustituciones acotadas con `scratch/build-0187.mjs`, que
-- aborta si algún anclaje no aparece exactamente una vez o si desaparece alguna
-- línea del original. Mismo procedimiento que 0116.
-- =============================================================================


-- ── A · La promo se configura, no se hardcodea ───────────────────────────────
--
-- Ventana, código, interruptor y tope en una sola key. Todo ajustable en
-- caliente: apagar la promo, mover el corte o subir el tope son un UPDATE, sin
-- migración y sin deploy. Es el freno rápido del rollback.

insert into public.app_settings (key, value)
values (
  'promo_free_delivery',
  jsonb_build_object(
    'code',            'free-delivery-2026-08',
    'active',          true,
    'from',            '2026-08-25',
    'to',              '2026-08-28',
    'max_redemptions', 100
  )
)
on conflict (key) do nothing;

-- NO se añade a la whitelist `as_public_read`: quien lee esta key es el RPC de
-- elegibilidad, que es SECURITY DEFINER. Publicarla al navegador no aporta nada
-- y expone el tope y la ventana a `anon` sin necesidad.


-- ── B · El ledger de la promo ────────────────────────────────────────────────
--
-- Una tabla que hace tres trabajos a la vez: el flag de redención por cuenta, la
-- auditoría de qué pedidos usaron la promo y cuánto costó, y la base del
-- contador nuevo/recurrente.

create table if not exists public.promo_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  promo_code            text not null,
  customer_user_id      uuid not null references public.users(id) on delete cascade,
  verified_phone        text not null,
  order_id              uuid not null references public.orders(id) on delete cascade,
  status                text not null default 'reserved'
                          check (status in ('reserved', 'redeemed', 'released')),
  waived_amount         numeric(10,2) not null,
  distance_band         public.distance_band,
  prior_delivered_count int not null,
  had_delivery_history  boolean not null,
  reserved_at           timestamptz not null default now(),
  redeemed_at           timestamptz,
  released_at           timestamptz
);

comment on table public.promo_redemptions is
  'Redenciones de promos de envío. Sobrevive al fin de la promo y al rollback: es la auditoría.';
comment on column public.promo_redemptions.verified_phone is
  'Teléfono del perfil VERIFICADO por OTP, nunca el que el cliente teclea en el checkout.';
comment on column public.promo_redemptions.waived_amount is
  'Lo que habría costado el envío. La suma sobre las redimidas es el coste de la promo.';
comment on column public.promo_redemptions.prior_delivered_count is
  'Entregas previas en v2 de esta cuenta O de su teléfono verificado. 0 = cliente nuevo.';
comment on column public.promo_redemptions.had_delivery_history is
  'Snapshot de customer_trusted_for_contraentrega: definición ancha (0171/0182), incluye el directorio del v1.';

-- LOS DOS CANDADOS. Son el corazón del diseño, no un índice de rendimiento.
--
-- El de cuenta impide dos envíos gratis a la misma cuenta. El de teléfono es lo
-- que hace que abrir una segunda cuenta con el mismo WhatsApp verificado no
-- sirva de nada: sea cual sea la cuenta, el número solo sostiene una reserva.
--
-- `released` queda FUERA de los dos a propósito: cancelar devuelve el cupo al
-- cliente (y al tope global), pero la fila se conserva para auditoría.
create unique index if not exists promo_redemptions_one_per_account_idx
  on public.promo_redemptions (promo_code, customer_user_id)
  where status in ('reserved', 'redeemed');

create unique index if not exists promo_redemptions_one_per_phone_idx
  on public.promo_redemptions (promo_code, verified_phone)
  where status in ('reserved', 'redeemed');

-- Índice del conteo del tope y del liquidador por pedido.
create index if not exists promo_redemptions_code_status_idx
  on public.promo_redemptions (promo_code, status);
create index if not exists promo_redemptions_order_idx
  on public.promo_redemptions (order_id);

-- RLS (invariante 3). Nadie escribe desde el navegador: las tres escrituras
-- vienen de funciones SECURITY DEFINER. Solo se conceden lecturas.
alter table public.promo_redemptions enable row level security;

drop policy if exists pr_self_read on public.promo_redemptions;
create policy pr_self_read on public.promo_redemptions for select to authenticated
  using (customer_user_id = (select auth.uid()));

drop policy if exists pr_admin_read on public.promo_redemptions;
create policy pr_admin_read on public.promo_redemptions for select to authenticated
  using ((select public.current_user_has_role('admin')));

grant select on public.promo_redemptions to authenticated;
grant select, insert, update on public.promo_redemptions to service_role;


-- ── C · El pedido dice que el envío se lo pagó la promo ──────────────────────
--
-- `delivery_fee_source` ya distinguía quién decidió el envío (0122). Gana un
-- tercer valor. Con `delivery_distance_band` intacta, la tarifa nominal sigue
-- siendo reconstruible desde `app_settings.delivery_bands` aunque
-- `promo_redemptions` no existiera.

alter table public.orders drop constraint if exists orders_delivery_fee_source_check;
alter table public.orders add constraint orders_delivery_fee_source_check
  check (
    delivery_fee_source is null
    or delivery_fee_source in ('business', 'system', 'promo')
  );


-- ── D · create_customer_order ────────────────────────────────────────────────
--
-- Generada, no escrita. Ver la cabecera. Un solo bloque nuevo, colocado tras el
-- bucle de ítems y antes de las validaciones de pago, más las declaraciones, dos
-- columnas en el UPDATE final y una clave en el payload de retorno.
--
-- Antes de aplicar en producción (§2.9 AGENTS.md):
--   SELECT oid, pg_get_function_arguments(oid) FROM pg_proc
--    WHERE proname = 'create_customer_order';
-- Debe devolver UNA sola fila. Verificado el 2026-08-25.

CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text)
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

  -- GUARD DE CONTRAENTREGA: exige historial de entregas.
  -- 0171 amplía QUÉ cuenta como historial. Antes: solo pedidos `delivered` de
  -- ESTA cuenta, que en el piloto casi nadie tiene porque los pedidos los tomó
  -- la cajera con `customer_user_id NULL`. Ahora también cuentan las entregas
  -- del teléfono VERIFICADO —las de v2, manuales incluidas, y las del v1
  -- congeladas en el ETL del directorio—. El teléfono lo resuelve la función
  -- desde el perfil, NUNCA desde `p_customer_phone`, que el cliente elige
  -- libremente. Ver la cabecera de 0171.
  if p_payment_intent in ('pending_cash', 'pending_yape') then
    if not public.customer_trusted_for_contraentrega(p_customer_user_id) then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    end if;
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
    delivery_distance_band, delivery_fee_source
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system'
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
    raise exception 'Pedidos mayores a S/% requieren pago adelantado.', v_threshold
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


-- ── E · La reserva se liquida sola ───────────────────────────────────────────
--
-- POR QUÉ UN TRIGGER Y NO PARCHEAR LAS FUNCIONES QUE CANCELAN
-- Son cinco (`expire_order`, `cancel_customer_order`,
-- `cancel_expired_prepay_orders`, el cancel de admin y el barrido de prepago
-- vencido) y `cancelled` es el estado terminal de todas: no existe un enum
-- `expired`. Un trigger las cubre a las cinco, y cubre la sexta que se escriba.
--
-- LIBERAR EN CANCELACIÓN ES UNA DECISIÓN DE NEGOCIO, NO UN DETALLE
-- Si el restaurante rechaza el pedido, el cliente no pierde su envío gratis. El
-- coste de abuso es nulo: puede cancelar mil veces y seguirá teniendo uno solo.
-- Y el cupo vuelve también al TOPE GLOBAL, para que una noche de rechazos no
-- consuma la promo publicitada sin haber entregado nada.
--
-- `delivered` es terminal (invariante 8), así que 'redeemed' no se deshace.

create or replace function public.promo_settle_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status <> 'delivered' then
    update public.promo_redemptions
       set status = 'redeemed', redeemed_at = now()
     where order_id = new.id and status = 'reserved';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.promo_redemptions
       set status = 'released', released_at = now()
     where order_id = new.id and status = 'reserved';
  end if;
  return null;
end;
$$;

comment on function public.promo_settle_redemption is
  'Redime la reserva de promo al entregar y la libera al cancelar. Independiente de generate_delivery_charges.';

drop trigger if exists trg_promo_settle_redemption on public.orders;
create trigger trg_promo_settle_redemption
after update of status on public.orders
for each row execute function public.promo_settle_redemption();


-- ── F · "¿Me toca?" — y si no, por qué ───────────────────────────────────────
--
-- Espejo de `current_customer_trusted_for_contraentrega` (0171): no acepta a
-- quién preguntar, solo responde por `auth.uid()`.
--
-- ES INFORMATIVO. Quien decide sigue siendo `create_customer_order`, que reserva
-- atómicamente. Por eso esta función es `stable` y NO toma el lock del tope:
-- serializar el pintado sería pagar el candado sin ninguna de sus garantías, y
-- un `eligible: true` que llegue obsoleto no regala nada.
--
-- EL ORDEN DE LOS MOTIVOS IMPORTA. `already_redeemed` se evalúa ANTES que
-- `exhausted`: a quien ya usó su envío gratis hay que decirle eso, no que "se
-- agotó" —que además sería una acusación falsa al resto de la operación.

create or replace function public.current_customer_promo_free_delivery()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_promo jsonb;
  v_code text;
  v_max int;
  v_phone text;
  v_taken int;
begin
  if v_uid is null then
    return jsonb_build_object('eligible', false, 'reason', 'inactive', 'code', null);
  end if;

  select value into v_promo from public.app_settings where key = 'promo_free_delivery';

  -- Config ausente o apagada. Mismo criterio que la sección D: explícito, y en
  -- polaridad positiva, para que un campo que falte cierre la promo y no la abra.
  if not found
     or not coalesce((v_promo ->> 'active')::boolean, false)
     or (v_promo ->> 'code') is null
     or (v_promo ->> 'max_redemptions') is null
  then
    return jsonb_build_object('eligible', false, 'reason', 'inactive', 'code', null);
  end if;

  v_code := v_promo ->> 'code';
  v_max  := (v_promo ->> 'max_redemptions')::int;

  if not (public.current_service_date()
          between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date) then
    return jsonb_build_object('eligible', false, 'reason', 'outside_window', 'code', v_code);
  end if;

  select cp.phone into v_phone
    from public.customer_profiles cp
   where cp.user_id = v_uid and cp.phone_verified_at is not null;

  -- Sin teléfono verificado no hay promo, pero tampoco hay pedido: el guard de
  -- `create_customer_order` corta antes. Se responde `inactive` para no pintar
  -- un cartel de promo a quien todavía no ha verificado.
  if v_phone is null then
    return jsonb_build_object('eligible', false, 'reason', 'inactive', 'code', v_code);
  end if;

  -- Cubre también la reserva en curso (`reserved`), no solo la redimida.
  if exists (
    select 1 from public.promo_redemptions pr
     where pr.promo_code = v_code
       and pr.status in ('reserved', 'redeemed')
       and (pr.customer_user_id = v_uid or pr.verified_phone = v_phone)
  ) then
    return jsonb_build_object('eligible', false, 'reason', 'already_redeemed', 'code', v_code);
  end if;

  -- MISMA EXPRESIÓN que el tope de la sección D y que el contador de la G. Si
  -- una de las tres cambia sin las otras, el checkout dice una cosa, el candado
  -- hace otra y el panel enseña una tercera.
  select count(*) into v_taken
    from public.promo_redemptions
   where promo_code = v_code and status in ('reserved', 'redeemed');

  if v_taken >= v_max then
    return jsonb_build_object('eligible', false, 'reason', 'exhausted', 'code', v_code);
  end if;

  return jsonb_build_object('eligible', true, 'reason', 'active', 'code', v_code);
end;
$$;

comment on function public.current_customer_promo_free_delivery is
  'Elegibilidad de promo de envío del usuario actual, para PINTAR. Quien decide es create_customer_order.';

revoke all on function public.current_customer_promo_free_delivery() from public;
grant execute on function public.current_customer_promo_free_delivery() to authenticated, service_role;


-- ── G · El contador ──────────────────────────────────────────────────────────
--
-- POR QUÉ UNA RPC Y NO UNA VISTA
-- No hay ni una vista en las 186 migraciones anteriores; el patrón para métricas
-- de admin es `admin_metrics` (0116): STABLE SECURITY DEFINER llamada con el
-- cliente de servicio desde el route. Y una vista `security_invoker` habría
-- fallado en silencio dos veces: la RLS de la sección B le habría escondido al
-- admin las redenciones ajenas (ceros, no error), y `max_redemptions` habría
-- llegado NULL porque `promo_free_delivery` no está en `as_public_read`.
--
-- PARTE DE LA CONFIGURACIÓN, NO DE LAS REDENCIONES. Si agrupara por
-- `promo_redemptions`, con cero pedidos devolvería cero filas y el panel no
-- podría enseñar "quedan 100" — que es justo el estado en el que hay que
-- mirarlo: antes de empezar.

create or replace function public.admin_promo_free_delivery_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_promo jsonb;
  v_code text;
  v_max int;
  v_stats jsonb;
begin
  select value into v_promo from public.app_settings where key = 'promo_free_delivery';
  if not found then
    return jsonb_build_object('configured', false);
  end if;

  v_code := v_promo ->> 'code';
  v_max  := (v_promo ->> 'max_redemptions')::int;

  select jsonb_build_object(
    'redimidos',            count(*) filter (where status = 'redeemed'),
    'clientesNuevos',       count(*) filter (where status = 'redeemed' and prior_delivered_count = 0),
    'clientesRecurrentes',  count(*) filter (where status = 'redeemed' and prior_delivered_count > 0),
    'enCurso',              count(*) filter (where status = 'reserved'),
    'liberados',            count(*) filter (where status = 'released'),
    'comprometidos',        count(*) filter (where status in ('reserved', 'redeemed')),
    'costoPromo',           coalesce(sum(waived_amount) filter (where status = 'redeemed'), 0)
  )
  into v_stats
  from public.promo_redemptions
  where promo_code = v_code;

  return jsonb_build_object(
    'configured',     true,
    'code',           v_code,
    'activa',         coalesce((v_promo ->> 'active')::boolean, false),
    'from',           v_promo ->> 'from',
    'to',             v_promo ->> 'to',
    'maxRedemptions', v_max,
    -- MISMA EXPRESIÓN que el tope de la D y el `exhausted` de la F.
    'cuposRestantes', v_max - (v_stats ->> 'comprometidos')::int
  ) || v_stats;
end;
$$;

comment on function public.admin_promo_free_delivery_stats is
  'Consumo de la promo de envío: redenciones, corte nuevo/recurrente, cupos restantes y coste.';

revoke all on function public.admin_promo_free_delivery_stats() from public;
grant execute on function public.admin_promo_free_delivery_stats() to service_role;
