-- =============================================================================
-- 0212 · El cliente se entera de que su plata llegó
-- =============================================================================
--
-- `OrderProofVerified` y `OrderValidated` estaban en la lista de "auditoria"
-- de `dispatch_event` (0136) y se quedaban en el outbox sin viajar nunca.
--
-- Los dos cierran una espera del CLIENTE en la que no puede hacer nada mas que
-- esperar:
--
--   · OrderProofVerified — pago, subio la captura del Yape, y la cajera la
--     aprobo. El pedido pasa a `preparing`. Sin aviso, el cliente se queda
--     mirando la pantalla sin saber si su plata llego a alguna parte.
--   · OrderValidated — el pedido estaba retenido por antifraude y la cajera lo
--     dio por bueno. Prepago vuelve a `pending_acceptance`, contraentrega va
--     directo a `preparing` (0189). Tampoco se le decia.
--
-- Que un evento sea auditoria o no lo decide si hay una PERSONA esperandolo, y
-- estos dos la tienen. `advance_order` no emite ningun `OrderStatusChanged` en
-- esos dos caminos, asi que no habia por donde enterarse.
--
-- La rama que escribe el texto de estos dos avisos vive en la Edge Function
-- `send-push`. Sin desplegarla, esta migracion solo consigue que los eventos
-- lleguen a una funcion que los ignora — inofensivo, pero inutil.
--
-- Idempotente: `create or replace`. Identica a la 0136 salvo las dos lineas
-- nuevas de la lista blanca y el comentario de cabecera.
-- =============================================================================

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  -- Eventos con destinatario humano. El resto (`BusinessBlocked`,
  -- `CustomerNoShow`, `OrderPrepExtended`, `order/appeal.created`) es
  -- auditoria: se queda en el outbox y no viaja.
  if new.event_type not in (
    'OrderStatusChanged',   -- ciclo del pedido (cliente, negocio y motorizado)
    'OrderExpired',         -- prepago sin comprobante (cliente)
    'OrderCreated',         -- pedido nuevo (negocio) + aviso anticipado (motorizado)
    'OrderQueued',          -- entro a la bandeja por reloj (motorizados)
    'OrderReleased',        -- el pedido vuelve a la bolsa (resto de motorizados)
    'OrderOverdue',         -- nadie lo ha tomado y se enfria (motorizados)
    'OrderProofVerified',   -- la cajera aprobo el comprobante (cliente)
    'OrderValidated',       -- el pedido paso el antifraude (cliente)
    'TransferRequested',    -- te piden tu pedido (dueño)
    'TransferResolved',     -- aceptado / rechazado / vencido (uno o los dos)
    'CashDelivered',        -- el motorizado declara efectivo (negocio)
    'CashConfirmed',        -- el negocio confirma (motorizado)
    'CashDisputed',         -- el negocio reporta diferencia (motorizado)
    'CashResolved'          -- Tindivo cierra el caso (motorizado)
  ) then
    return new;
  end if;

  select value into v_cfg from public.app_settings where key = 'push_dispatch';
  v_url := v_cfg ->> 'url';
  v_key := v_cfg ->> 'anonKey';
  if v_url is null then
    return new; -- push no configurado (dev): no-op
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'event_type', new.event_type,
      'aggregate_id', new.aggregate_id,
      'payload', new.payload
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
  return new;
end;
$$;

-- Los default privileges de Supabase devuelven EXECUTE a anon en cada
-- `create or replace`, asi que el revoke se repite. Ver la nota de la 0100.
revoke all on function public.dispatch_event() from public, anon, authenticated;
