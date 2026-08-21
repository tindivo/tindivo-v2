-- =============================================================================
-- 0174 · Los cuatro relojes dejan de estar clavados y de pisarse
-- =============================================================================
--
-- QUÉ CAMBIA
--   1. `cancel_expired_prepay_orders()` pasa a ser la ÚNICA autoridad sobre las
--      cuatro cancelaciones por tiempo, y lee sus minutos de `app_settings.timers`.
--   2. Se desprograman los tres pg_cron que hacían el mismo trabajo en paralelo
--      con SQL en línea. Queda `auto-cancel-prepay-timeout`, que llama a la
--      función.
--
-- POR QUÉ · TRES DEFECTOS EN LA MISMA ZONA
--
-- (a) LOS NÚMEROS ESTABAN CLAVADOS EN EL SQL DE LOS CRON.
--     `interval '5 minutes'` escrito dentro del cuerpo del job. `app_settings`
--     era decorativo: solo lo leía Inngest, que es la red de seguridad, no
--     quien cancela. Por eso la `0113` pudo subir `acceptanceMinutes` a 15
--     tocando solo la config y nadie lo notó durante meses — el cron siguió
--     cancelando a los 5. Mientras el número no salía de la base mentía en
--     privado; desde la `0172` el cliente lo ve en pantalla, así que
--     `app_settings` tiene que ser la verdad y no una opinión.
--
--     Y no era solo el cliente: `apps/negocios` también repetía los cuatro
--     valores a mano. Con esta migración los tres consumidores (base, cajera,
--     cliente) leen la MISMA fila.
--
-- (b) DOS CRON CANCELABAN `pending_acceptance` CON MOTIVOS DISTINTOS.
--     `auto-cancel-pending-acceptance` ponía `pending_acceptance_timeout` y el
--     bloque 1 de esta función ponía `prepay_timeout`, los dos a los 5 minutos,
--     los dos cada minuto, sobre las mismas filas. Ganaba el que confirmara
--     primero: una moneda al aire.
--
--     No es cosmético. El motivo decide QUÉ SE LE DICE AL CLIENTE
--     (`cancelledCopy`, apps/customer):
--       · `pending_acceptance_timeout` → «No pudimos confirmar tu pedido»  ✔
--       · `prepay_timeout`             → «Se acabó el tiempo para pagar»   ✘
--     O sea que la mitad de las veces se culpaba al cliente de no pagar cuando
--     quien no respondió fue el restaurante. En prod todavía no había pasado
--     (cero pedidos cancelados por este camino), pero estaba armado.
--
--     Ahora ese bloque pone `pending_acceptance_timeout`, que es el motivo
--     correcto. NO abre la vía de devolución de la `0124`: esa exige
--     `payment_proof_status = 'verified'`, imposible en `pending_acceptance`
--     porque el prepago paga después, en `awaiting_payment`.
--
-- (c) EL FILTRO DE LA VALIDACIÓN ANTIFRAUDE APUNTABA A UN VALOR IMPOSIBLE.
--     La `0159` escribió `validation_context = 'call'`, pero el CHECK de la
--     tabla solo admite `'antifraud'` y `'proof'`:
--       CHECK (validation_context = ANY (ARRAY['antifraud','proof']))
--     Esa rama nunca podía ser cierta. Funcionaba de rebote por la segunda mitad
--     de la condición (`validation_context IS NULL AND payment_intent <>
--     'prepaid'`), que cubre a la contraentrega porque hoy nadie le rellena el
--     campo. El día que alguien escribiera el valor bueno —'antifraud'— el
--     pedido dejaba de encajar en su cron y caía al de prepago: 10 minutos en
--     vez de 5 y `prepay_timeout` en vez de `validation_timeout`.
--
-- QUÉ **NO** CAMBIA
--   · Los plazos efectivos: 5 / 15 / 5 / 10, los mismos de `DECISIONS.md §10`.
--   · La firma de la función ni sus permisos. La sigue llamando el pg_cron y
--     también el panel de la cajera desde el navegador
--     (`apps/negocios/components/dashboard/chrome.tsx`), que la usa para barrer
--     al instante cuando un contador suyo llega a 0:00. Por eso la función
--     cubre los CUATRO relojes y no solo los del prepago: si le quitara bloques,
--     ese barrido dejaría de alcanzarlos.
--
-- REVERSIBILIDAD: supabase/rollbacks/0174_the_four_clocks_stop_being_hardcoded_and_stop_racing.rollback.sql

CREATE OR REPLACE FUNCTION public.cancel_expired_prepay_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_timers jsonb;
  v_acceptance int;
  v_payment int;
  v_validation int;
  v_verification int;
  v_c1 integer := 0;
  v_c2 integer := 0;
  v_c3 integer := 0;
  v_c4 integer := 0;
BEGIN
  SELECT value INTO v_timers FROM public.app_settings WHERE key = 'timers';

  -- Los `coalesce` conservan los valores de DECISIONS §10 si la clave faltara.
  -- Son la red para una fila incompleta, no el sitio donde vive el número.
  v_acceptance   := coalesce((v_timers ->> 'acceptanceMinutes')::int, 5);
  v_payment      := coalesce((v_timers ->> 'paymentMinutes')::int, 15);
  v_validation   := coalesce((v_timers ->> 'validationMinutes')::int, 5);
  v_verification := coalesce((v_timers ->> 'prepayVerificationMinutes')::int, 10);

  -- 1 · El negocio no confirmó disponibilidad.
  -- Sin filtro por `payment_intent`: la ventana de aceptación es la misma para
  -- contraentrega y para prepago (los dos nacen aquí).
  WITH cancelled1 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'pending_acceptance_timeout',
        cancel_note = format(
          'Auto-cancelado: el negocio no confirmó disponibilidad en %s minutos', v_acceptance)
    WHERE status = 'pending_acceptance'
      AND coalesce(pending_acceptance_at, created_at)
            <= now() - (v_acceptance * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c1 FROM cancelled1;

  -- 2 · El cliente no pagó ni subió su captura.
  WITH cancelled2 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = format('Auto-cancelado: pago no realizado en %s minutos', v_payment)
    WHERE status = 'awaiting_payment'
      AND coalesce(awaiting_payment_at, updated_at)
            <= now() - (v_payment * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c2 FROM cancelled2;

  -- 3 · Validación humana de contraentrega.
  -- Excluye el prepago explícitamente en vez de por el rodeo de la 0159. Los
  -- bloques 3 y 4 son disjuntos: aquí NUNCA entra un prepago, y todo prepago
  -- en `validando` cae en el 4.
  WITH cancelled3 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'validation_timeout',
        cancel_note = format('Auto-cancelado: no se validó al cliente en %s minutos', v_validation)
    WHERE status = 'validando'
      AND payment_intent <> 'prepaid'
      AND (validation_context = 'antifraud' OR validation_context IS NULL)
      AND coalesce(validating_at, created_at)
            <= now() - (v_validation * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c3 FROM cancelled3;

  -- 4 · La cajera no revisó el comprobante.
  WITH cancelled4 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = format(
          'Auto-cancelado: validación del comprobante no completada en %s minutos', v_verification)
    WHERE status = 'validando'
      AND (validation_context = 'proof' OR payment_intent = 'prepaid')
      AND coalesce(validating_at, created_at)
            <= now() - (v_verification * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c4 FROM cancelled4;

  RETURN v_c1 + v_c2 + v_c3 + v_c4;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_prepay_orders() TO anon, authenticated, service_role;

-- Los tres jobs que hacían este mismo trabajo con SQL en línea. `cron.unschedule`
-- lanza si el job no existe, de ahí el guard: la migración tiene que poder
-- aplicarse dos veces (invariante 6 de CLAUDE.md).
DO $mig$
DECLARE
  v_job text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOREACH v_job IN ARRAY ARRAY[
      'auto-cancel-pending-acceptance',
      'auto-cancel-validando',
      'auto-cancel-prepay-validation-timeout'
    ] LOOP
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job) THEN
        PERFORM cron.unschedule(v_job);
      END IF;
    END LOOP;

    -- El superviviente. Idempotente por nombre.
    PERFORM cron.schedule('auto-cancel-prepay-timeout', '* * * * *',
      'SELECT public.cancel_expired_prepay_orders();');
  END IF;
END
$mig$;
