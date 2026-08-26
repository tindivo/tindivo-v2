-- =============================================================================
-- 0190 · La cajera puede corregir lo que acaba de teclear
--
-- Idempotente. Rollback en
-- supabase/rollbacks/0190_the_cashier_can_fix_what_she_just_typed.rollback.sql
-- Spec: Docs/spec/spec-edicion-pedido-manual.md
-- =============================================================================
--
-- POR QUÉ
-- Hoy, si la cajera se equivoca al tomar un pedido por teléfono, su única salida
-- es cancelar y volver a tipearlo. Medido en prod: 7 de las 21 cancelaciones de
-- pedidos manuales (33%) son eso — mismo teléfono, pedido nuevo en menos de 30
-- minutos. Una de 25.90 a 45.90; dos con el importe IDÉNTICO, o sea que lo que
-- estaba mal era la dirección, el teléfono o el método de pago.
--
-- El apaño cuesta el `short_id` que el cliente ya apuntó, el `numero_pedido`, y
-- deja en las métricas una cancelación que parece un rechazo del negocio.
--
-- DOS VENTANAS, NO UNA
--   preparing · waiting_driver · heading_to_restaurant  → dinero y contacto
--   waiting_at_restaurant                               → SOLO contacto
--   picked_up en adelante                               → nada
--
-- El dinero cierra un estado antes que el resto, y el motivo está en el código
-- del motorizado: `ChangeHeadsUp` se pinta en `waiting_at_restaurant` y le dice
-- «Lleva S/X de vuelto. Consíguelo aquí, antes de salir». El sencillo cambia de
-- manos FÍSICAMENTE en ese estado, y el sistema solo lee `change_to_give` mucho
-- después, al entregar. Si la cajera pudiera editar el billete ahí, el
-- motorizado saldría con un adelanto en el bolsillo distinto del que se le va a
-- rendir, y el descuadre no se vería hasta el corte de caja.
--
-- `picked_up` sigue siendo el techo del contacto: es donde `advance_order`
-- congela `commission_amount` y `delivery_fee_charged`.
--
-- LA BANDA NO SE TOCA
-- `delivery_distance_band` decide el envío (near 2.00 / far 2.50) y es lo ÚNICO
-- que una edición podría mover de lo que el negocio le debe a Tindivo. Queda
-- fuera: lo corrige un admin. Con eso, y siendo la comisión PLANA (1.50/1.00, no
-- un porcentaje), editar el total no cambia un céntimo de la deuda y la
-- superficie de abuso de esta feature es cero.
--
-- POR QUÉ UN HELPER Y NO DOS COPIAS
-- La partición del total y la cadena de efectivo tienen que ser IDÉNTICAS al
-- crear y al editar. Con dos copias, la vía de edición acaba aceptando lo que la
-- de creación rechaza, y en silencio. La regla del repo dice «extraer con 3+
-- usos» y aquí son 2: se salta a propósito, porque la regla existe para no
-- abstraer de más, no para tolerar dos copias de una validación de dinero.
--
-- CÓMO SE GENERÓ LA SECCIÓN B
-- `create_business_manual_order` NO se reescribió a mano: se extrajo su
-- `pg_get_functiondef` (md5 27cacf9d1af1dcd3fd213e06018d1018, verificado contra
-- prod) y recibió tres sustituciones acotadas con `scratch/build-0190.mjs`, que
-- aborta si un anclaje no aparece exactamente una vez, si desaparece una línea
-- que no toca, o si queda aritmética de dinero fuera del helper.
-- =============================================================================


-- ── A · La partición del total, en un solo sitio ─────────────────────────────
--
-- El envío es PARÁMETRO, no se resuelve aquí: al crear sale de la banda que la
-- cajera eligió, y al editar sale de la fila (porque la banda no se puede
-- cambiar). Esa es la única diferencia entre las dos vías; todo lo demás —el
-- reparto, el mixto que debe sumar, el billete que debe cubrir, el vuelto que
-- sale— es idéntico y vive aquí.
--
-- Devuelve `changeToGive` YA resuelto a NULL cuando no hay vuelto que dar, para
-- que esa regla tampoco quede repartida entre los dos llamadores.

create or replace function public.manual_order_money(
  p_total_amount     numeric,
  p_delivery_fee     numeric,
  p_payment_intent   public.payment_intent,
  p_client_pays_with numeric,
  p_yape_amount      numeric,
  p_cash_amount      numeric
) returns jsonb
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  v_order_amount numeric;
  v_cash_part    numeric;
  v_change       numeric;
begin
  if coalesce(p_total_amount, 0) <= 0 then
    raise exception 'Monto invalido' using errcode = 'P0001';
  end if;

  -- 0129 · La comida se DEDUCE del total: la cajera teclea lo que paga el
  -- cliente, no el subtotal.
  v_order_amount := round(p_total_amount - coalesce(p_delivery_fee, 0), 2);

  if v_order_amount <= 0 then
    raise exception 'El total (S/ %) debe ser mayor que el envío (S/ %)',
      to_char(p_total_amount, 'FM999999990.00'),
      to_char(coalesce(p_delivery_fee, 0), 'FM999999990.00')
      using errcode = 'P0001';
  end if;

  if p_payment_intent = 'pending_mixed' then
    v_cash_part := coalesce(p_cash_amount, 0);
    if coalesce(p_yape_amount, 0) + v_cash_part <> p_total_amount then
      raise exception 'La suma de Yape y Efectivo debe ser igual al total'
        using errcode = 'P0001';
    end if;
  else
    v_cash_part := case when p_payment_intent = 'pending_cash' then p_total_amount else 0 end;
  end if;

  if (p_payment_intent = 'pending_cash' or p_payment_intent = 'pending_mixed')
     and p_client_pays_with is not null then
    if p_client_pays_with < v_cash_part then
      raise exception 'El monto con el que pagará el cliente debe cubrir la parte en efectivo'
        using errcode = 'P0001';
    end if;
    v_change := round(p_client_pays_with - v_cash_part, 2);
  else
    v_change := 0;
  end if;

  return jsonb_build_object(
    'orderAmount', v_order_amount,
    'cashPart',    v_cash_part,
    -- NULL, no 0: «no hay vuelto que dar» y «el vuelto es cero» se guardaban
    -- distinto desde 0131 y hay filas de las dos clases.
    'changeToGive',
      case when p_client_pays_with is not null and v_cash_part > 0 then v_change else null end
  );
end;
$$;

comment on function public.manual_order_money is
  'Partición del total de un pedido manual y validación de la cadena de efectivo. Único sitio: lo comparten crear y editar (0190).';

revoke all on function public.manual_order_money(numeric, numeric, public.payment_intent, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.manual_order_money(numeric, numeric, public.payment_intent, numeric, numeric, numeric)
  to service_role;


-- ── B · create_business_manual_order pasa a usar el helper ───────────────────
--
-- Generada, no escrita. Ver la cabecera. Sin cambio de comportamiento: las
-- mismas validaciones, en el mismo orden, con los mismos mensajes.

CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_total_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric, p_delivery_distance_band distance_band DEFAULT NULL::distance_band, p_address_directory_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_order_id uuid;
  v_short_id text;
  v_order_number int;
  v_delivery_fee numeric;
  v_order_amount numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
  v_money jsonb;
  v_clean_phone text;
  v_band public.distance_band;
  v_fee_source text;
  -- 0145 · directorio
  v_ref_clean text;
  v_ref_norm text;
  v_dir_id uuid;
  v_dir_lat double precision;
  v_dir_lng double precision;
  v_dir_created boolean := false;
  v_has_default boolean;
BEGIN
  SELECT * INTO v_business FROM public.businesses WHERE user_id = p_business_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no encontrado' USING errcode = 'P0002'; END IF;
  -- Solo se bloquea si la cuenta está suspendida por administración
  IF v_business.is_blocked THEN RAISE EXCEPTION 'Tu cuenta esta suspendida' USING errcode = 'P0001'; END IF;

  -- Guard de entrada. El que de verdad importa —que quede comida después de
  -- restar el envío— no puede evaluarse todavía: la banda aún no se resolvió.
  -- Va más abajo, justo después del envío.
  IF COALESCE(p_total_amount, 0) <= 0 THEN RAISE EXCEPTION 'Monto invalido' USING errcode = 'P0001'; END IF;

  -- 1. Validar referencia condicional a delivery_method
  IF p_delivery_method = 'delivery' AND length(trim(COALESCE(p_delivery_reference, ''))) < 5 THEN
    RAISE EXCEPTION 'La dirección o referencia de entrega debe tener al menos 5 caracteres' USING errcode = 'P0001';
  END IF;

  -- 2. Normalizar teléfono (dígitos limpios) y validar formato
  v_clean_phone := NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g'), '');
  IF v_clean_phone IS NOT NULL AND v_clean_phone !~ '^9\d{8}$' THEN
    RAISE EXCEPTION 'Formato de teléfono inválido' USING errcode = 'P0001';
  END IF;

  -- 3. Validar blacklist de teléfonos de prueba
  IF v_clean_phone IS NOT NULL AND v_clean_phone IN (
    '999999999', '987654321', '912345678', '955555555', '900000000', '911111111', '123456789'
  ) THEN
    RAISE EXCEPTION 'Número de teléfono de prueba no permitido' USING errcode = 'P0001';
  END IF;

  -- 4. Antifraude del cliente
  IF v_clean_phone IS NOT NULL AND public.customer_is_blocked(NULL, v_clean_phone) THEN
    RAISE EXCEPTION 'Cliente temporalmente bloqueado por incidentes reiterados de entrega.'
      USING errcode = 'P0001';
  END IF;

  v_prep := greatest(5, least(COALESCE(p_prep_time_minutes, 20), 120));

  IF p_delivery_method = 'pickup' THEN
    v_band := NULL;
    v_fee_source := 'system';
    v_delivery_fee := 0;
  ELSE
    IF p_delivery_distance_band IS NULL THEN
      v_band := 'near'::public.distance_band;
      v_fee_source := 'system';
    ELSE
      v_band := p_delivery_distance_band;
      v_fee_source := 'business';
    END IF;

    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
    v_delivery_fee := COALESCE(
      (v_bands ->> v_band::text)::numeric,
      v_business.delivery_fee,
      2.00
    );
  END IF;

  -- 0190 · La partición del total y la cadena de efectivo viven en UN solo
  -- sitio, compartido con `update_business_manual_order`. Si esta función y la
  -- de edición validaran por separado, la vía de edición acabaría aceptando lo
  -- que la de creación rechaza, y en silencio. Ver la cabecera de 0190.
  --
  -- El envío NO entra en el helper: aquí sale de la banda que se acaba de
  -- resolver, y en la edición sale de la fila (la cajera no puede cambiarlo).
  -- Esa es justo la diferencia entre las dos vías, y por eso es un parámetro.
  v_money := public.manual_order_money(
    p_total_amount, v_delivery_fee, p_payment_intent,
    p_client_pays_with, p_yape_amount, p_cash_amount
  );
  v_order_amount := (v_money ->> 'orderAmount')::numeric;
  v_cash_part    := (v_money ->> 'cashPart')::numeric;
  -- Ya viene resuelto a NULL cuando no hay vuelto que dar: la regla de cuándo
  -- se guarda y cuándo no también vive en el helper, no repartida por aquí.
  v_change       := (v_money ->> 'changeToGive')::numeric;

  -- ═══ 0145 · Resolver la fila del directorio ════════════════════════════════
  v_ref_clean := NULLIF(trim(COALESCE(p_delivery_reference, '')), '');

  IF p_delivery_method = 'delivery'
     AND v_clean_phone IS NOT NULL
     AND v_ref_clean IS NOT NULL THEN

    IF p_address_directory_id IS NOT NULL THEN
      SELECT ad.id, ad.lat, ad.lng INTO v_dir_id, v_dir_lat, v_dir_lng
        FROM public.address_directory ad
       WHERE ad.id = p_address_directory_id
         AND ad.phone = v_clean_phone;
    END IF;

    IF v_dir_id IS NULL THEN
      v_ref_norm := lower(btrim(regexp_replace(v_ref_clean, '\s+', ' ', 'g')));

      SELECT ad.id, ad.lat, ad.lng INTO v_dir_id, v_dir_lat, v_dir_lng
        FROM public.address_directory ad
       WHERE ad.phone = v_clean_phone
         AND lower(btrim(regexp_replace(ad.reference, '\s+', ' ', 'g'))) = v_ref_norm
       ORDER BY ad.is_default DESC, ad.last_used_at DESC NULLS LAST
       LIMIT 1;
    END IF;

    IF v_dir_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.address_directory
         WHERE phone = v_clean_phone AND is_default
      ) INTO v_has_default;

      INSERT INTO public.address_directory (
        phone, customer_name, reference, source, is_default, updated_by
      ) VALUES (
        v_clean_phone,
        NULLIF(trim(COALESCE(p_customer_name, '')), ''),
        v_ref_clean,
        'business_created',
        NOT v_has_default,
        p_business_user_id
      ) RETURNING id INTO v_dir_id;

      v_dir_created := true;
    END IF;

    UPDATE public.address_directory
       SET times_used = times_used + 1,
           last_used_at = now()
     WHERE id = v_dir_id;
  END IF;

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, prep_time_minutes,
    estimated_ready_at, appears_in_queue_at,
    client_pays_with, yape_amount, cash_amount, change_to_give,
    delivery_distance_band, delivery_fee_source,
    address_directory_id, delivery_coordinates_lat, delivery_coordinates_lng
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''), v_clean_phone,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Recojo en tienda' ELSE 'Pedido manual' END,
    CASE WHEN p_delivery_method = 'pickup' THEN NULL ELSE NULLIF(trim(COALESCE(p_delivery_reference, '')), '') END,
    v_order_amount, v_delivery_fee, 'preparing', v_prep,
    now() + (v_prep || ' minutes')::interval,
    now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
    p_client_pays_with, p_yape_amount, p_cash_amount,
    v_change,
    v_band, v_fee_source,
    v_dir_id,
    v_dir_lat::numeric, v_dir_lng::numeric
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id,
    'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'totalCharged', p_total_amount,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'source', 'business_manual', 'prepTimeMinutes', v_prep,
    'clientPaysWith', p_client_pays_with, 'yapeAmount', p_yape_amount, 'cashAmount', p_cash_amount,
    'band', v_band, 'deliveryFeeSource', v_fee_source,
    'addressDirectoryId', v_dir_id, 'addressCreated', v_dir_created,
    'hasGps', (v_dir_lat IS NOT NULL)
  ));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created_manual', 'business', p_business_user_id,
    jsonb_build_object(
      'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
      'amount', v_order_amount, 'totalCharged', p_total_amount, 'band', v_band,
      'deliveryFee', v_delivery_fee, 'deliveryFeeSource', v_fee_source,
      'addressDirectoryId', v_dir_id, 'addressCreated', v_dir_created
    ));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'preparing',
    'total', p_total_amount,
    'change', v_change,
    'addressDirectoryId', v_dir_id,
    'addressCreated', v_dir_created
  );
END;
$function$;


-- ── C · La edición ───────────────────────────────────────────────────────────
--
-- PAYLOAD COMPLETO, NO PARCIAL. Recibe siempre todos los campos editables y los
-- escribe de una vez. Así nunca queda una fila con el total de una edición y el
-- método de pago de otra.
--
-- TESTIGO DE VERSIÓN. Payload completo + `for update` todavía deja pasar la
-- pérdida de actualización clásica: una pestaña vieja guarda un cambio de
-- teléfono y de paso revierte un total que otra pestaña ya había corregido —y es
-- MÁS probable con payload completo, precisamente porque pisa campos que ni se
-- tocaron. `p_expected_updated_at` lo cierra. Sirve `orders.updated_at` sin
-- inventar nada: el trigger `touch_orders` lo refresca en CADA update de la
-- tabla, así que también detecta los cambios que no vienen de la cajera —una
-- transición del motorizado, por ejemplo—, que es justo lo que se quiere.
--
-- El error de conflicto lleva `DETAIL` marcado, mismo patrón que el
-- `active_order_block:` de `create_customer_order`: la ruta lo traduce a un 409
-- con el pedido actual en el cuerpo para que la UI pinte el conflicto sin volver
-- a preguntar, y sin limpiarle el formulario a la cajera.

create or replace function public.update_business_manual_order(
  p_order_id            uuid,
  p_business_user_id    uuid,
  p_expected_updated_at timestamptz,
  p_total_amount        numeric,
  p_payment_intent      public.payment_intent,
  p_customer_name       text    default null,
  p_customer_phone      text    default null,
  p_delivery_reference  text    default null,
  p_client_pays_with    numeric default null,
  p_yape_amount         numeric default null,
  p_cash_amount         numeric default null,
  p_reason              text    default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_order       public.orders;
  v_business    public.businesses;
  v_money       jsonb;
  v_clean_phone text;
  v_ref         text;
  v_name        text;
  v_cambios     jsonb := '{}'::jsonb;
  v_dinero      boolean;
  v_dir_corregido boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no existe' using errcode = 'P0002';
  end if;

  -- Solo manuales. Un pedido de la web tiene items y modificadores detrás:
  -- editarle el total por aquí dejaría la fila diciendo una cosa y sus líneas
  -- otra.
  if v_order.source <> 'business_manual' then
    raise exception 'Solo se pueden editar los pedidos tomados por el negocio'
      using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found or v_business.id <> v_order.business_id then
    raise exception 'No autorizado sobre este pedido' using errcode = 'P0001';
  end if;

  -- ── El testigo de versión, ANTES de validar nada más ──────────────────────
  -- Va aquí a propósito: si el pedido cambió, lo que la cajera tiene delante ya
  -- no describe la realidad, y validar su payload contra la fila nueva daría
  -- mensajes que no ayudan («el billete no cubre el efectivo» cuando lo que pasó
  -- es que otra pestaña cambió el total).
  if p_expected_updated_at is null
     or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió mientras lo editabas'
      using errcode = 'P0001', detail = 'stale_order_edit:' || p_order_id::text;
  end if;

  -- ── Las dos ventanas ──────────────────────────────────────────────────────
  v_dinero :=
       p_total_amount     is distinct from (v_order.order_amount + v_order.delivery_fee)
    or p_payment_intent   is distinct from v_order.payment_intent
    or p_client_pays_with is distinct from v_order.client_pays_with
    or p_yape_amount      is distinct from v_order.yape_amount
    or p_cash_amount      is distinct from v_order.cash_amount;

  if v_order.status not in ('preparing', 'waiting_driver', 'heading_to_restaurant',
                            'waiting_at_restaurant') then
    raise exception 'Este pedido ya no se puede editar: el motorizado lo recogió'
      using errcode = 'P0001';
  end if;

  -- El sencillo ya cambió de manos en el mostrador (ver la cabecera).
  if v_dinero and v_order.status = 'waiting_at_restaurant' then
    raise exception 'El motorizado ya está en el local con el vuelto: el dinero no se puede cambiar. Dile lo que cambió y lo registra al entregar.'
      using errcode = 'P0001';
  end if;

  -- SIN motivo obligatorio, a proposito.
  --
  -- Lo llevaba, y se quito tras probar la pantalla: la cajera corrige el
  -- pedido con el cliente al telefono, y un campo de texto libre entre ella y
  -- el boton de guardar es friccion en el peor momento. Lo previsible no es
  -- que escriba mejores motivos, sino que deje de corregir y vuelva a
  -- cancelar y retipear, que es justo el habito que esto viene a sustituir.
  --
  -- Lo que la auditoria necesitaba de verdad NO se pierde: el log sigue
  -- guardando QUE cambio, con su antes y su despues campo por campo, mas el
  -- estado y si habia motorizado. Eso reconstruye un total que bajo; el texto
  -- libre solo lo adornaba.
  --
  -- `p_reason` se conserva en la firma: no cuesta nada y deja la puerta
  -- abierta a que un admin anote desde su panel sin cambiar el contrato.

  -- ── Contacto ──────────────────────────────────────────────────────────────
  v_name := nullif(trim(coalesce(p_customer_name, '')), '');

  v_clean_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '');
  if v_clean_phone is not null and v_clean_phone !~ '^9\d{8}$' then
    raise exception 'Formato de teléfono inválido' using errcode = 'P0001';
  end if;

  v_ref := nullif(trim(coalesce(p_delivery_reference, '')), '');
  if v_order.delivery_method = 'delivery' and length(coalesce(v_ref, '')) < 5 then
    raise exception 'La dirección o referencia de entrega debe tener al menos 5 caracteres'
      using errcode = 'P0001';
  end if;

  -- ── Dinero: el MISMO helper que la creación ───────────────────────────────
  -- El envío sale de la FILA, no de la banda: la cajera no puede cambiarla, así
  -- que el reparto se hace contra lo que ya se cobró.
  v_money := public.manual_order_money(
    p_total_amount, v_order.delivery_fee, p_payment_intent,
    p_client_pays_with, p_yape_amount, p_cash_amount
  );

  -- ── Qué cambió de verdad, para el log ─────────────────────────────────────
  if p_total_amount is distinct from (v_order.order_amount + v_order.delivery_fee) then
    v_cambios := v_cambios || jsonb_build_object('total', jsonb_build_object(
      'de', v_order.order_amount + v_order.delivery_fee, 'a', p_total_amount));
  end if;
  if p_payment_intent is distinct from v_order.payment_intent then
    v_cambios := v_cambios || jsonb_build_object('paymentIntent', jsonb_build_object(
      'de', v_order.payment_intent, 'a', p_payment_intent));
  end if;
  if p_client_pays_with is distinct from v_order.client_pays_with then
    v_cambios := v_cambios || jsonb_build_object('clientPaysWith', jsonb_build_object(
      'de', v_order.client_pays_with, 'a', p_client_pays_with));
  end if;
  if v_clean_phone is distinct from v_order.customer_phone then
    v_cambios := v_cambios || jsonb_build_object('customerPhone', jsonb_build_object(
      'de', v_order.customer_phone, 'a', v_clean_phone));
  end if;
  if v_name is distinct from v_order.customer_name then
    v_cambios := v_cambios || jsonb_build_object('customerName', jsonb_build_object(
      'de', v_order.customer_name, 'a', v_name));
  end if;
  if v_ref is distinct from v_order.delivery_reference then
    v_cambios := v_cambios || jsonb_build_object('deliveryReference', jsonb_build_object(
      'de', v_order.delivery_reference, 'a', v_ref));
  end if;

  -- Guardar sin cambiar nada no es un error, pero tampoco merece una fila en el
  -- log ni un `updated_at` nuevo que invalide la pestaña de al lado.
  if v_cambios = '{}'::jsonb then
    return jsonb_build_object('ok', true, 'sinCambios', true,
      'updatedAt', v_order.updated_at, 'shortId', v_order.short_id);
  end if;

  -- ── El UPDATE ─────────────────────────────────────────────────────────────
  -- NO toca: estado, relojes de cocina, banda, envío, `address_directory`,
  -- `short_id` ni `numero_pedido`. Ver §8 del spec.
  update public.orders set
    order_amount       = (v_money ->> 'orderAmount')::numeric,
    payment_intent     = p_payment_intent,
    client_pays_with   = case when p_payment_intent in ('pending_cash', 'pending_mixed')
                              then p_client_pays_with end,
    yape_amount        = case when p_payment_intent in ('pending_yape', 'pending_mixed')
                              then p_yape_amount end,
    cash_amount        = case when p_payment_intent = 'pending_mixed'
                              then p_cash_amount end,
    change_to_give     = (v_money ->> 'changeToGive')::numeric,
    customer_name      = v_name,
    customer_phone     = v_clean_phone,
    delivery_reference = case when v_order.delivery_method = 'pickup' then null else v_ref end
  where id = p_order_id;

  -- ── El directorio: corregir, nunca acuñar ─────────────────────────────────
  --
  -- Crear un pedido manual escribe en `address_directory`, que es el
  -- autocompletado por teléfono de la cajera (701 direcciones curadas del
  -- piloto). Si ella se equivocó al teclear, esa fila nace equivocada.
  --
  -- La primera versión de 0190 NO tocaba el directorio, con este argumento:
  -- «si editar también creara filas, sería un segundo camino para acuñarse
  -- confianza de contraentrega (0182), y repetible». El argumento estaba
  -- invertido: la fila mala YA se acuñó al crear el pedido. No tocarla no
  -- impide que exista — solo impide ARREGLARLA, y deja tres cosas rotas:
  --
  --   · el autocompletado no aprende y hay que reescribir la dirección;
  --   · el teléfono mal tecleado —que suele ser el de otro vecino real— se
  --     queda en la agenda para siempre con una dirección que no es suya;
  --   · y por 0182 ese número gana confianza para pagar contraentrega sin
  --     haberla ganado.
  --
  -- Así que se corrige, con una regla que NO acuña: se ACTUALIZA la fila que
  -- este pedido creó, nunca se inserta una nueva. Cero filas nuevas = cero
  -- caminos nuevos de confianza.
  --
  -- LAS CUATRO CONDICIONES, cada una por un motivo distinto:
  --
  --   1. `address_directory_id` no nulo — hay fila que corregir.
  --   2. NINGÚN OTRO pedido la referencia. Si la comparte, es una dirección
  --      que ya servía a otros: entonces el equivocado fue este pedido, no la
  --      agenda, y reescribirla corrompería datos curados.
  --   3. El teléfono nuevo existe y no es el de otra fila. `phone` es NOT NULL
  --      con un CHECK de nueve dígitos, y un manual puede no llevar teléfono.
  --      Y si el número correcto YA tiene entrada, esa es la buena: no se toca.
  --      Esto además esquiva `address_directory_default_unique`
  --      (UNIQUE (phone) WHERE is_default), que de otro modo abortaría la
  --      edición entera con una violación de índice.
  --   4. La referencia nueva no es nula. También es NOT NULL, y en un pedido
  --      de recojo la edición la deja en null.
  if v_order.address_directory_id is not null
     and v_ref is not null
     and v_clean_phone is not null
     and (v_clean_phone is distinct from v_order.customer_phone
          or v_ref is distinct from v_order.delivery_reference
          or v_name is distinct from v_order.customer_name)
     and not exists (
       select 1 from public.orders o
        where o.address_directory_id = v_order.address_directory_id
          and o.id <> p_order_id
     )
     and not exists (
       select 1 from public.address_directory ad
        where ad.phone = v_clean_phone
          and ad.id <> v_order.address_directory_id
     )
  then
    update public.address_directory
       set phone         = v_clean_phone,
           reference     = v_ref,
           customer_name = v_name,
           updated_by    = p_business_user_id
     where id = v_order.address_directory_id;
    v_dir_corregido := true;
  end if;

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.manual_edited', 'business', p_business_user_id,
    jsonb_build_object(
      'cambios', v_cambios,
      'motivo', nullif(trim(coalesce(p_reason, '')), ''),
      'tocaDinero', v_dinero,
      'statusAlEditar', v_order.status,
      'tieneMotorizado', v_order.driver_id is not null,
      'directorioCorregido', v_dir_corregido));

  return (
    select jsonb_build_object(
      'ok', true, 'shortId', o.short_id, 'updatedAt', o.updated_at,
      'orderAmount', o.order_amount, 'deliveryFee', o.delivery_fee,
      'total', o.order_amount + o.delivery_fee,
      'changeToGive', o.change_to_give,
      'tocaDinero', v_dinero,
      'tieneMotorizado', o.driver_id is not null,
      'directorioCorregido', v_dir_corregido,
      'cambios', v_cambios)
    from public.orders o where o.id = p_order_id
  );
end;
$$;

comment on function public.update_business_manual_order is
  'Edición de un pedido manual por su negocio. Dinero hasta waiting_at_restaurant, contacto hasta picked_up. Concurrencia por testigo updated_at (0190).';

revoke all on function public.update_business_manual_order(uuid, uuid, timestamptz, numeric, public.payment_intent, text, text, text, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.update_business_manual_order(uuid, uuid, timestamptz, numeric, public.payment_intent, text, text, text, numeric, numeric, numeric, text)
  to service_role;
