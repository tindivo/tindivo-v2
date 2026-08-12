-- =============================================================================
-- 0147 · El motorizado apunta dónde está la casa de verdad
-- =============================================================================
--
-- CIERRA LA CADENA.
--   0144 le dio a la cajera el buscador. 0145 hizo que el pedido apunte a la
--   fila del directorio y le copie las coordenadas. Falta la pieza que llena
--   esas coordenadas la primera vez: el motorizado, que es el único que está
--   parado en la puerta.
--
--     cajera apunta (sin GPS) → pedido apunta a la fila → MOTORIZADO ESCRIBE EL
--     GPS al entregar → la próxima vez la cajera ya lo tiene.
--
-- POR QUÉ UN RPC APARTE Y NO DENTRO DE `advance_order`.
--   `advance_order` es el camino del dinero y se ha reescrito dos veces hoy
--   (0140 y 0146). Meter aquí la captura de direcciones acoplaría el GPS a la
--   entrega: un fallo escribiendo una coordenada podría tumbar el cobro.
--   Separadas, la entrega ocurre pase lo que pase y la dirección es un extra
--   que se intenta aparte. Es exactamente lo que pide el spec del directorio:
--   "quien capture direcciones debe tratar la excepción, no dejar que tumbe la
--   entrega" (0122).
--
-- SOLO PEDIDOS MANUALES.
--   Un pedido B2C trae la dirección de la libreta del cliente
--   (`customer_addresses`), que es OTRA tabla y es del cliente, no del
--   directorio operativo. Dejar que el motorizado escriba ahí sería editarle la
--   libreta a alguien que no se lo pidió. La guarda es explícita y devuelve un
--   error claro, no un silencio.
--
-- EL MOTORIZADO CORRIGE, NUNCA CREA.
--   Al revés que la cajera (0145), que crea y nunca edita. El motorizado escribe
--   sobre la fila a la que YA apunta el pedido. Si el pedido no apunta a
--   ninguna —porque se creó sin teléfono— se actualiza solo el snapshot del
--   pedido y se dice en la respuesta: `directoryUpdated: false`. Inventar una
--   fila aquí crearía duplicados sin el dedup por referencia que hace 0145.
--
-- QUÉ SE ESCRIBE Y DÓNDE, SEGÚN EL ESTADO.
--   · Pedido AÚN NO ENTREGADO -> directorio Y snapshot del pedido. El snapshot
--     manda para esta entrega, así que corregirlo ayuda al que va en camino.
--   · Pedido YA ENTREGADO     -> SOLO el directorio. El pedido es un documento
--     histórico: dice a dónde se entregó, y eso no se reescribe.
--
-- LOS TRES DEFECTOS DEL LEGACY QUE NO SE PORTAN (medidos, `PENDIENTES.md`).
--   1. GPS falla -> el legacy plantaba el pin en el centro del pueblo con el
--      botón Confirmar habilitado: 18 direcciones falsas. Aquí la coordenada
--      viene siempre de un gesto explícito y el centro NUNCA es un fallback.
--   2. `accuracy: 0` hardcodeado al reconfirmar: 49 filas con la precisión
--      destruida. Aquí 0 se rechaza; ausencia de medida es NULL.
--   3. Sin rango en lat/lng: lo cerró el CHECK de 0122, y aquí se valida ANTES
--      para devolver un mensaje legible en vez de una violación de constraint.
--
-- ROLLBACK: supabase/rollbacks/0147_the_driver_writes_down_where_the_house_actually_is.rollback.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.capture_delivery_address(
  p_order_id uuid,
  p_driver_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  -- NULL = el pin se arrastró a mano, así que no hay medida del sensor. Es la
  -- convención de 0122: `accuracy_m` numérico significa GPS, NULL significa pin.
  p_accuracy_m double precision DEFAULT NULL,
  -- Mejora opcional de la referencia. NULL = no se toca la que había.
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_driver_id uuid;
  v_ref_clean text;
  v_directory_updated boolean := false;
  v_snapshot_updated boolean := false;
BEGIN
  -- ── 1 · El pedido existe ───────────────────────────────────────────────────
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING errcode = 'P0002';
  END IF;

  -- ── 2 · Quien escribe es EL MOTORIZADO DE ESTE PEDIDO ─────────────────────
  -- No basta con tener rol driver: tiene que ser el asignado. Si no, cualquier
  -- motorizado podría reescribir la dirección de un reparto ajeno.
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = p_driver_user_id;
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'No eres un motorizado' USING errcode = 'P0001';
  END IF;
  IF v_order.driver_id IS DISTINCT FROM v_driver_id THEN
    RAISE EXCEPTION 'Este pedido no es tuyo' USING errcode = 'P0001';
  END IF;

  -- ── 3 · Solo pedidos manuales ─────────────────────────────────────────────
  IF v_order.source <> 'business_manual' THEN
    RAISE EXCEPTION 'Solo se captura la dirección en pedidos manuales'
      USING errcode = 'P0001';
  END IF;

  -- ── 4 · Validaciones de la coordenada, ANTES de tocar nada ────────────────
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Faltan las coordenadas' USING errcode = 'P0001';
  END IF;

  -- La misma caja de San Jacinto que el CHECK de 0122. Se valida aquí para
  -- devolver un mensaje que una persona entienda; si se dejara al CHECK, el
  -- motorizado vería una violación de constraint en medio de una entrega.
  IF NOT (p_lat BETWEEN -9.20 AND -9.10 AND p_lng BETWEEN -78.33 AND -78.23) THEN
    RAISE EXCEPTION 'La ubicación está fuera de San Jacinto (lat %, lng %)',
      to_char(p_lat, 'FM990.000000'), to_char(p_lng, 'FM990.000000')
      USING errcode = 'P0001';
  END IF;

  -- Los dos centinelas del legacy. 0 venía de un `accuracy: 0` hardcodeado y
  -- 999 de "el GPS falló": ninguno es una medición. Si llegan, es un bug del
  -- cliente y se corta aquí en vez de guardar basura que luego nadie distingue.
  IF p_accuracy_m IS NOT NULL AND (
       p_accuracy_m <= 0
       OR p_accuracy_m >= 1000
       OR p_accuracy_m BETWEEN 998.5 AND 999.5
     ) THEN
    RAISE EXCEPTION 'Precisión inválida (%). Si no hay medida del sensor, mandá NULL', p_accuracy_m
      USING errcode = 'P0001';
  END IF;

  v_ref_clean := NULLIF(btrim(COALESCE(p_reference, '')), '');
  IF v_ref_clean IS NOT NULL AND length(v_ref_clean) < 5 THEN
    RAISE EXCEPTION 'La referencia debe tener al menos 5 caracteres' USING errcode = 'P0001';
  END IF;

  -- ── 5 · El directorio: CORREGIR la fila a la que apunta el pedido ─────────
  IF v_order.address_directory_id IS NOT NULL THEN
    UPDATE public.address_directory
       SET lat        = p_lat,
           lng        = p_lng,
           accuracy_m = p_accuracy_m,
           -- `source` dice QUIÉN tocó la fila por última vez (0122). A partir
           -- de ahora la tocó el que estuvo en la puerta, que es la mejor
           -- fuente que va a tener esta dirección.
           source     = 'driver_verified',
           reference  = COALESCE(v_ref_clean, reference),
           updated_by = p_driver_user_id
     WHERE id = v_order.address_directory_id;

    v_directory_updated := FOUND;
  END IF;

  -- ── 6 · El snapshot del pedido, solo si sigue vivo ────────────────────────
  -- Un pedido entregado es un documento histórico: dice a dónde se entregó de
  -- verdad. Reescribirlo después borraría esa constancia.
  IF v_order.status <> 'delivered' THEN
    UPDATE public.orders
       SET delivery_coordinates_lat = p_lat::numeric,
           delivery_coordinates_lng = p_lng::numeric,
           delivery_reference       = COALESCE(v_ref_clean, delivery_reference)
     WHERE id = p_order_id;

    v_snapshot_updated := true;
  END IF;

  -- ── 7 · Rastro ────────────────────────────────────────────────────────────
  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.address_captured', 'motorizado', p_driver_user_id,
    jsonb_build_object(
      'lat', p_lat,
      'lng', p_lng,
      -- Cómo se capturó, deducido de la precisión: es la convención de 0122 y
      -- lo que permitirá medir después cuántas direcciones traen sensor.
      'method', CASE WHEN p_accuracy_m IS NULL THEN 'pin_arrastrado' ELSE 'sensor' END,
      'accuracyM', p_accuracy_m,
      'referenceImproved', (v_ref_clean IS NOT NULL),
      'addressDirectoryId', v_order.address_directory_id,
      'directoryUpdated', v_directory_updated,
      'snapshotUpdated', v_snapshot_updated
    ));

  RETURN jsonb_build_object(
    'directoryUpdated', v_directory_updated,
    'snapshotUpdated', v_snapshot_updated,
    'addressDirectoryId', v_order.address_directory_id
  );
END;
$function$;

COMMENT ON FUNCTION public.capture_delivery_address(uuid, uuid, double precision, double precision, double precision, text) IS
  'El motorizado escribe el GPS de una dirección de pedido manual. Corrige la '
  'fila del directorio a la que apunta el pedido; nunca crea una nueva.';

-- Grants. La llama el API con service_role. El REVOKE va a `public` primero
-- porque Postgres otorga EXECUTE a PUBLIC en toda función nueva y `anon` lo
-- hereda: revocarle solo a `anon` deja el grant de PUBLIC intacto.
REVOKE EXECUTE ON FUNCTION public.capture_delivery_address(
  uuid, uuid, double precision, double precision, double precision, text
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.capture_delivery_address(
  uuid, uuid, double precision, double precision, double precision, text
) TO service_role;
