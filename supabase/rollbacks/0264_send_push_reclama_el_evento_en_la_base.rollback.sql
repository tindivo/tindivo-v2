-- ROLLBACK de la 0264 · send-push reclama el evento en la base
--
-- Quita `claim_push_event` y la columna `push_claimed_at`, y deja `dispatch_event` tal cual la 0238
-- (cuerpo sin `event_id`). SIN ESTO, si queda desplegada la función nueva de send-push, rechaza
-- todo evento normal con 400. Redesplegar antes la función anterior.
-- También BORRA la fila `app_settings.push_claim_since`: es configuración de esta migración, no un
-- dato de negocio, y dejarla viva reabre el doble envío (la función vieja envía sin sellar y, al
-- volver la nueva con un corte antiguo, esos eventos serían reclamables otra vez; CAX-001). Así,
-- re-aplicar la 0264 tras este rollback arranca en fallo cerrado, como el primer despliegue: el corte
-- se fija a now() tras redesplegar la función nueva y esperar 1 minuto (Docs/operacion/deploy.md §2.2).

DELETE FROM public.app_settings WHERE key = 'push_claim_since';
DROP FUNCTION IF EXISTS public.claim_push_event(uuid);
ALTER TABLE public.domain_events DROP COLUMN IF EXISTS push_claimed_at;

CREATE OR REPLACE FUNCTION public.dispatch_event()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cfg jsonb;
  v_url text;
  v_key text;
BEGIN
  IF new.event_type NOT IN (
    'OrderStatusChanged', 'OrderExpired', 'OrderCreated', 'OrderQueued', 'OrderReleased',
    'OrderOverdue', 'OrderProofVerified', 'OrderValidated', 'TransferRequested',
    'TransferResolved', 'CashDelivered', 'CashConfirmed', 'CashDisputed', 'CashResolved',
    'CourierStepped'
  ) THEN
    RETURN new;
  END IF;

  SELECT value INTO v_cfg FROM public.app_settings WHERE key = 'push_dispatch';
  v_url := v_cfg ->> 'url';
  v_key := v_cfg ->> 'anonKey';
  IF v_url IS NULL THEN
    RETURN new;
  END IF;

  PERFORM net.http_post(
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
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_event() FROM PUBLIC, anon, authenticated;
