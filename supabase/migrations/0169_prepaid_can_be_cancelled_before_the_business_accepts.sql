-- =============================================================================
-- 0169 · El prepago se puede cancelar mientras nadie ha pagado nada
-- =============================================================================
--
-- QUÉ CAMBIA
-- `cancel_customer_order` bloqueaba el prepago en TODOS los estados. Pasa a
-- bloquearlo solo desde `awaiting_payment` en adelante.
--
-- POR QUÉ
-- `0046` puso el bloqueo con este argumento: «que un POST directo a la API no
-- pueda autocancelar un pedido ya pagado». El argumento es bueno y sigue
-- vigente — pero se aplicó a un estado en el que **todavía no hay nada pagado**.
--
-- Un prepago nace en `pending_acceptance` igual que uno en efectivo
-- (`create_customer_order`: `v_status := 'pending_acceptance'`). En esa fase el
-- negocio aún está confirmando que tiene lo que se le pidió; el cliente no ha
-- abierto su billetera. Solo cuando el negocio acepta pasa a `awaiting_payment`,
-- y ahí sí empieza el dinero.
--
--   · pending_acceptance · el negocio confirma disponibilidad · NO hay dinero
--   · awaiting_payment   · el cliente yapea y sube la captura  · sí hay dinero
--   · validando          · la cajera revisa la captura         · sí hay dinero
--
-- Así que el bloqueo protegía un caso que no existía todavía, y a cambio dejaba
-- al cliente sin salida justo en el momento de menor riesgo: alguien que pide
-- «para probar» y quiere deshacerlo antes de que nadie mueva un dedo.
--
-- POR QUÉ LA LÍNEA VA EXACTAMENTE AHÍ
-- No sirve mirar si subió el comprobante. En `awaiting_payment` el cliente pudo
-- haber hecho el Yape y no haber subido la foto aún: el dinero ya salió aunque
-- la app no lo sepa. El único punto en el que se puede afirmar que no hay nada
-- que devolver es ANTES de que el negocio acepte.
--
-- `validando` sigue permitido para efectivo (no lo toca esta migración) y sigue
-- prohibido para prepago, que es lo correcto: ahí hay una captura subida.
--
-- REVERSIBILIDAD: supabase/rollbacks/0169_...rollback.sql

create or replace function public.cancel_customer_order(
  p_order_id uuid,
  p_customer_user_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.customer_user_id is null or v_order.customer_user_id <> p_customer_user_id then
    raise exception 'No autorizado para cancelar este pedido' using errcode = 'P0001';
  end if;
  -- Ventana de cancelación: solo mientras el restaurante aún no acepta (DECISIONS §estados).
  if v_order.status not in ('validando', 'pending_acceptance') then
    raise exception 'Tu pedido ya fue aceptado por el restaurante y no puede cancelarse' using errcode = 'P0001';
  end if;
  -- Prepago: no se autocancela DESDE QUE HAY DINERO DE POR MEDIO (0169).
  -- En `pending_acceptance` no lo hay, así que se cancela como cualquier otro.
  if v_order.payment_intent = 'prepaid' and v_order.status <> 'pending_acceptance' then
    raise exception 'Ya enviaste tu pago, así que este pedido no se cancela desde la app; escríbenos por soporte'
      using errcode = 'P0001';
  end if;

  update public.orders
    set status = 'cancelled', cancel_reason = 'customer_cancelled', cancelled_by = p_customer_user_id
    where id = p_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderStatusChanged',
    jsonb_build_object('action', 'cancel', 'status', 'cancelled', 'reason', 'customer_cancelled'));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.cancel', 'cliente', p_customer_user_id,
    jsonb_build_object('reason', 'customer_cancelled'));

  return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'cancelReason', 'customer_cancelled');
end;
$$;

grant execute on function public.cancel_customer_order(uuid, uuid) to service_role;
