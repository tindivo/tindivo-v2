-- 0231 · La cola se entera cuando otro se lleva el pedido
--
-- EL SÍNTOMA. Un motorizado toma un pedido y otro sigue viéndolo en
-- Disponibles hasta 15 s después. Si intenta tomarlo, el servidor lo rechaza
-- («Lo tomó otro motorizado»), pero la tarjeta no debía seguir ahí.
--
-- LA CAUSA. El board escucha `postgres_changes` sobre `orders`, y ese canal
-- respeta la RLS: cuando la fila DEJA de ser visible para ti (`ord_driver_read`
-- solo deja ver los pedidos sin dueño), Realtime no puede evaluar la policy
-- contra el registro nuevo y no manda nada. El único que se entera es el que
-- lo tomó. El resto depende del poll de respaldo (15 s) o de minimizar y volver.
--
-- LA SALIDA. Un aviso por Broadcast, que no depende de la visibilidad de la
-- fila: al salir un pedido de la cola (lo toma alguien, o se cancela) el
-- trigger lo anuncia en el tema `drivers:board`, y cada motorizado conectado
-- lo saca de su lista al instante.
--
-- QUÉ VIAJA. Solo el id del pedido y el del motorizado que se lo llevó (nulo si
-- fue una cancelación). Nada de cliente, dirección ni importes: quien reciba el
-- aviso sin poder leer el pedido no aprende nada que no supiera.
--
-- QUIÉN LO RECIBE. El tema es PRIVADO: `realtime.messages` tiene RLS y solo
-- deja leerlo a un usuario con rol `driver`. Un canal público lo oiría
-- cualquiera con la clave anónima.
--
-- NUNCA ROMPE LA TRANSICIÓN. El aviso es un lujo; el pedido, no. Si
-- `realtime.send` falla por lo que sea, se avisa en el log y la transacción
-- del pedido sigue su curso.

CREATE OR REPLACE FUNCTION public.broadcast_order_left_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('orderId', NEW.id, 'driverId', NEW.driver_id),
      'order_left_queue',
      'drivers:board',
      true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_order_left_queue: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$function$;

-- Es función de trigger: nadie tiene por qué poder llamarla a mano. Los
-- privilegios por defecto de Supabase dejan EXECUTE a anon, así que no basta
-- con quitárselo a PUBLIC.
REVOKE ALL ON FUNCTION public.broadcast_order_left_queue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_broadcast_left_queue ON public.orders;
CREATE TRIGGER trg_orders_broadcast_left_queue
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  -- SOLO EL FLANCO QUE IMPORTA: estaba en la cola (sin dueño y en preparación
  -- o esperando motorizado) y ya no. Cualquier otro UPDATE de `orders` pasa de
  -- largo sin costar nada.
  WHEN (
    OLD.driver_id IS NULL
    AND OLD.status IN ('preparing', 'waiting_driver')
    AND (
      NEW.driver_id IS NOT NULL
      OR NEW.status NOT IN ('preparing', 'waiting_driver')
    )
  )
  EXECUTE FUNCTION public.broadcast_order_left_queue();

DROP POLICY IF EXISTS drivers_receive_board_broadcast ON realtime.messages;
CREATE POLICY drivers_receive_board_broadcast ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT realtime.topic()) = 'drivers:board'
    AND (SELECT public.current_user_has_role('driver'::public.user_role))
  );
