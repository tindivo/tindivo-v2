-- =============================================================================
-- 0182 · El directorio, y no solo el ETL, dice a quién conoce el pueblo
-- =============================================================================
--
-- POR QUÉ.
--   La 0171 abrió la contraentrega a tres formas de historial. La tercera —una
--   fila de `address_directory`— llegó con un candado:
--
--     and ad.legacy_address_id is not null
--
--   Es decir: del directorio SOLO valían las filas venidas del ETL del v1. Una
--   dirección nacida en la operación de v2 no contaba, por buena que fuera su
--   procedencia. Eso deja fuera al motorizado, que es el único que estuvo
--   parado en la puerta, y al admin, que curó la fila a mano.
--
--   Esta migración quita el candado: estar en el directorio basta.
--
-- LO QUE 0171 ARGUMENTABA, Y POR QUÉ SE ACEPTA EL COSTE.
--   El candado no era arbitrario. Desde la 0145 la cajera CREA la fila al TOMAR
--   el pedido (`source = 'business_created'`), no al entregarlo, así que "estar
--   en el directorio" es acuñable: llamas al restaurante, das tu número,
--   cancelas, y ya figuras. Ese agujero SE ABRE AQUÍ, y conviene decirlo con
--   todas las letras en vez de descubrirlo dentro de seis meses.
--
--   Lo que lo hace asumible, y que no cambia:
--     · Hay que CONTROLAR ese WhatsApp. El teléfono sale del perfil verificado
--       por OTP, nunca de `p_customer_phone` (ver 0171). Acuñarse confianza para
--       el número del vecino sigue siendo imposible.
--     · El riesgo sigue mandando. `customer_requires_prepayment` corre ANTES que
--       cualquier cláusula de historial y devuelve false pase lo que pase:
--       `contraentrega_blocked` y los strikes de la cuenta Y del teléfono. El
--       agujero da UN no-show, no una carrera libre.
--     · `prepay_threshold` (S/80) sigue intacto: conocido con pedido grande
--       paga por adelantado igual.
--     · La cajera llama. El antifraude de este piloto es humano y sigue en pie.
--
-- CUÁNTO CAMBIA DE VERDAD, MEDIDO EN PROD HOY (2026-08-20).
--   Teléfonos del directorio con `legacy_address_id IS NULL` —los únicos que
--   este cambio puede tocar— y si YA eran de confianza por la cláusula (2)
--   (una entrega suya en v2):
--
--     source            teléfonos   ya confiados   ganan confianza
--     ────────────────  ─────────   ────────────   ───────────────
--     driver_verified          45             45                 0
--     business_created         17             16                 1
--
--   O sea: hoy el cambio afecta a UN teléfono. No es una amnistía masiva; es
--   una regla más simple que se adelanta al caso que aún no ha ocurrido, que es
--   el vecino que la cajera apuntó y que todavía no tiene entrega en v2.
--
-- QUÉ CAMBIA.
--   `public.customer_trusted_for_contraentrega(uuid)`, y solo su cláusula (3).
--   El resto del cuerpo es el de 0171 carácter por carácter (md5
--   626fc68dbd7afb67a0fdfd08993fa633, verificado idéntico en local y en prod
--   antes de tocarlo).
--
--   NO se toca `current_customer_trusted_for_contraentrega()`: es un wrapper
--   sobre ésta y hereda el cambio. NO se toca `create_customer_order`: llama al
--   predicado por nombre. Un solo sitio decide.
--
-- ÍNDICES: ninguno que crear. El predicado nuevo filtra solo por `phone`, que
--   es exactamente `address_directory_phone_idx`. La consulta queda mejor
--   servida que antes, no peor.
--
-- ROLLBACK: supabase/rollbacks/0182_the_directory_itself_says_who_the_town_knows.rollback.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.customer_trusted_for_contraentrega(p_customer_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
declare
  v_phone text;
begin
  if p_customer_user_id is null then
    return false;
  end if;

  -- El teléfono sale del PERFIL VERIFICADO, nunca de un parámetro. Ver 0171.
  select right(regexp_replace(cp.phone, '\D', '', 'g'), 9)
    into v_phone
  from public.customer_profiles cp
  where cp.user_id = p_customer_user_id
    and cp.phone_verified_at is not null;

  -- Un teléfono fuera de formato no puede casar con `orders.customer_phone` ni
  -- con `address_directory.phone`, que son `^9\d{8}$`. Se anula para que las
  -- cláusulas de abajo lo salten en vez de comparar basura.
  if v_phone is not null and v_phone !~ '^9\d{8}$' then
    v_phone := null;
  end if;

  -- EL RIESGO MANDA SOBRE CUALQUIER HISTORIAL, y con 0182 manda sobre uno más
  -- ancho. `customer_requires_prepayment` (0044) cubre las tres anclas:
  -- `contraentrega_blocked` del perfil, y los strikes anclados a la cuenta Y al
  -- teléfono. La referencia va NULL porque aquí todavía no hay dirección que
  -- mirar. Esta guarda es la que convierte el agujero de la cabecera en un solo
  -- no-show: NO tocarla al aflojar nada de lo de abajo.
  if public.customer_requires_prepayment(p_customer_user_id, v_phone, null) then
    return false;
  end if;

  -- (1) Historial de ESTA cuenta. No depende del teléfono a propósito: quien ya
  --     pidió aquí y cambió de número sigue avalado por sus propias entregas.
  if exists (
    select 1 from public.orders o
    where o.customer_user_id = p_customer_user_id
      and o.status = 'delivered'
  ) then
    return true;
  end if;

  if v_phone is null then
    return false;
  end if;

  -- (2) Entregas del teléfono en v2, incluidos los pedidos manuales de la
  --     cajera (`customer_user_id IS NULL`), que son 72 de los 75 del piloto.
  if exists (
    select 1 from public.orders o
    where o.customer_phone = v_phone
      and o.status = 'delivered'
  ) then
    return true;
  end if;

  -- (3) ESTAR EN EL DIRECTORIO, venga de donde venga. Aquí estaba el filtro
  --     `legacy_address_id` de 0171, y esto es todo lo que 0182 cambia. Cuentan
  --     por igual el ETL del v1 (`backfill`), la fila que el motorizado
  --     verificó en la puerta (`driver_verified`), la que curó un admin
  --     (`admin_curated`) y la que la cajera apuntó al tomar el pedido
  --     (`business_created`) — esta última es la que abre el agujero descrito
  --     en la cabecera, y se acepta a sabiendas.
  return exists (
    select 1 from public.address_directory ad
    where ad.phone = v_phone
  );
end $fn$;

COMMENT ON FUNCTION public.customer_trusted_for_contraentrega(uuid) IS
  'true si el cliente puede pagar contraentrega sin prepago. Resuelve el '
  'telefono desde el perfil VERIFICADO, nunca de un parametro (0171). Desde '
  '0182 cuenta CUALQUIER fila de address_directory, no solo las del ETL del v1.';

-- Los privilegios de 0171 sobreviven a CREATE OR REPLACE (no se recrea el
-- objeto, se reemplaza el cuerpo), pero se reafirman por si esta migración se
-- aplica sobre una base donde la función no existía: sin el REVOKE, el uuid
-- arbitrario convierte a la función en un oráculo sobre cuentas ajenas.
REVOKE EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) TO service_role;

-- ─── Guarda ──────────────────────────────────────────────────────────────────
-- Que el filtro se fue de verdad. Un CREATE OR REPLACE que no llegue a
-- aplicarse dejaría viva la 0171, y el cambio se leería como "el directorio no
-- sirve" — el mismo fallo mudo que 0171 documenta para la normalización.
do $guard$
declare
  v_body text;
begin
  -- Se quitan los comentarios `--` ANTES de mirar. La cláusula (3) nombra el
  -- filtro para explicar que se fue, así que un `like` a secas se dispararía
  -- con su propia explicación y esta guarda no probaría nada. Comparar el
  -- código sin comentarios, e insensible a mayúsculas, es lo que la hace real.
  v_body := regexp_replace(
    pg_get_functiondef('public.customer_trusted_for_contraentrega(uuid)'::regprocedure),
    '--[^\n]*',
    '',
    'g'
  );

  if v_body ~* 'legacy_address_id' then
    raise exception '0182: el filtro legacy_address_id sigue vivo en el predicado';
  end if;
end $guard$;
