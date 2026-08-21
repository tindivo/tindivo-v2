-- =============================================================================
-- 0178 · La deuda baja la persiana sola a los S/600
-- =============================================================================
--
-- ⚠️  REVERTIDA POR LA 0179. NO LA APLIQUES SOLA.
--     El corte automático se dio marcha atrás por decisión de producto: dejaba a
--     un negocio sin vender sin que nadie lo decidiera, y en silencio, porque
--     `dispatch_event` no convierte `BusinessBlocked` en push. Las dos van
--     siempre juntas; si un `db push` se corta entre ellas, comprueba con
--     `select prosrc from pg_proc where proname = 'recalc_business_balance'`
--     que la función NO menciona `debt_block_threshold`, y aplica la 0179.
--
--     Para reactivarlo a propósito: mete `BusinessBlocked` en la lista de
--     eventos que viajan de `dispatch_event` ANTES de nada más.
--
-- QUÉ CAMBIA
--   1. Nueva clave `app_settings.debt_block_threshold` = 600.
--   2. `recalc_business_balance()` —el trigger que ya corre en CADA cargo— pasa
--      a suspender al negocio al alcanzar ese saldo, y a levantarle la
--      suspensión cuando baja de él.
--   3. Nuevo trigger `trg_orders_business_not_blocked`: un negocio suspendido
--      deja de poder recibir pedidos nuevos, venga el pedido de donde venga.
--
-- POR QUÉ (1) Y (2)
-- Hasta hoy la suspensión por deuda no la disparaba nada. El número que veía la
-- cajera en su pantalla de saldo («Límite de crédito, S/300 máx.») era un
-- adorno: `recalc_business_balance` solo volvía a sumar el ledger y
-- `block_business` no consulta importe alguno — la suspensión era siempre una
-- decisión a mano del admin.
--
-- El umbral va a `app_settings` y no dentro de esta función por la misma razón
-- que los timers en la `0174`: lo tienen que leer la base Y la pantalla del
-- negocio, y dos copias del mismo número acaban discrepando.
--
-- POR QUÉ (3) · EL AGUJERO QUE HABÍA QUE TAPAR ANTES
-- Suspender a un negocio NO impedía que le siguieran entrando pedidos. Lo
-- comprobé función por función:
--
--   · `is_published_business()` y `search_catalog()` sí lo excluyen → desaparece
--     del catálogo y del buscador.
--   · `create_business_manual_order` sí lo rechaza ('Tu cuenta esta suspendida').
--   · `create_customer_order` **NO**. Solo mira `customer_is_blocked`, o sea el
--     bloqueo del CLIENTE. Del negocio no comprueba nada.
--
-- Y desde la `0165` la página del negocio se comparte por slug, así que basta
-- con tener el enlace guardado en WhatsApp para saltarse el catálogo. Sin este
-- punto, el corte automático no cortaría nada para los clientes habituales, que
-- son justamente los que tienen el link.
--
-- Se hace con un trigger de tabla y no añadiendo el `IF` dentro de
-- `create_customer_order` a propósito: así la regla cubre cualquier vía de
-- inserción, presente o futura, en vez de depender de que cada RPC nueva se
-- acuerde de repetir el guard. Es `BEFORE INSERT`: los pedidos que ya estaban en
-- marcha cuando cae la persiana se entregan con normalidad.
--
-- DECISIONES QUE HE TOMADO Y CONVIENE REVISAR
--   · Corta AL ALCANZAR los 600 (`>=`), no al pasarlos.
--   · Levanta la suspensión en cuanto el saldo baja de 600, no al llegar a cero.
--     `settle_business_charges` exigía `balance_due <= 0` para desbloquear, que
--     como regla manual valía, pero como regla automática sería una trampa:
--     obligaría a pagar los 600 enteros para volver a vender, cuando lo que se
--     le anunció al negocio es un límite de 600.
--   · Solo toca suspensiones POR DEUDA. Si el admin bloqueó por otro motivo
--     (`is_blocked` sin `blocked_for_debt`), pagar no lo levanta y llegar al
--     umbral no le pisa el motivo.
--   · El mensaje que ve el cliente NO menciona la deuda del restaurante.
--
-- REVERSIBILIDAD: supabase/rollbacks/0178_the_debt_closes_the_shutter_by_itself.rollback.sql

-- ── 1 · El umbral, donde lo pueden leer los dos lados ─────────────────────────
INSERT INTO public.app_settings (key, value)
VALUES ('debt_block_threshold', '600'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- ── 2 · El saldo decide la persiana ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_business_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_business_id uuid := COALESCE(NEW.business_id, OLD.business_id);
  v_threshold numeric;
  v_balance numeric;
  v_was_blocked boolean;
  v_was_for_debt boolean;
  v_debe_bloquear boolean;
  v_debe_soltar boolean;
BEGIN
  SELECT (value #>> '{}')::numeric INTO v_threshold
    FROM public.app_settings WHERE key = 'debt_block_threshold';
  v_threshold := COALESCE(v_threshold, 600);

  SELECT COALESCE(SUM(bc.amount), 0) INTO v_balance
    FROM public.business_charges bc
   WHERE bc.business_id = v_business_id
     AND bc.status = 'pending';

  SELECT b.is_blocked, b.blocked_for_debt
    INTO v_was_blocked, v_was_for_debt
    FROM public.businesses b
   WHERE b.id = v_business_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Suspender solo si no estaba ya suspendido: un bloqueo del admin por otro
  -- motivo conserva SU razón y no se convierte en un bloqueo por deuda.
  v_debe_bloquear := v_balance >= v_threshold AND NOT v_was_blocked;
  -- Soltar solo lo que suspendió la deuda.
  v_debe_soltar := v_balance < v_threshold AND v_was_for_debt;

  UPDATE public.businesses b
     SET balance_due = v_balance,
         is_blocked = CASE WHEN v_debe_bloquear THEN true
                           WHEN v_debe_soltar THEN false
                           ELSE b.is_blocked END,
         blocked_for_debt = CASE WHEN v_debe_bloquear THEN true
                                 WHEN v_debe_soltar THEN false
                                 ELSE b.blocked_for_debt END,
         block_reason = CASE
           WHEN v_debe_bloquear THEN format(
             'Suspension automatica: saldo deudor de S/ %s, limite S/ %s',
             to_char(v_balance, 'FM999999990.00'), to_char(v_threshold, 'FM999999990.00'))
           WHEN v_debe_soltar THEN NULL
           ELSE b.block_reason END
   WHERE b.id = v_business_id;

  -- Outbox en la MISMA transacción que el cambio (invariante 4 de CLAUDE.md),
  -- y con los mismos `event_type` que usan `block_business`/`unblock_business`
  -- para que el panel de admin no tenga que distinguir quién lo hizo.
  IF v_debe_bloquear THEN
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('business', v_business_id, 'BusinessBlocked',
            jsonb_build_object('reason', 'debt_threshold', 'balance', v_balance,
                               'threshold', v_threshold, 'by', 'system'));
  ELSIF v_debe_soltar THEN
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('business', v_business_id, 'BusinessUnblocked',
            jsonb_build_object('reason', 'debt_paid_down', 'balance', v_balance,
                               'threshold', v_threshold, 'by', 'system'));
  END IF;

  RETURN NULL;
END;
$fn$;

-- ── 3 · Un negocio suspendido no recibe pedidos nuevos ────────────────────────
CREATE OR REPLACE FUNCTION public.orders_reject_if_business_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.businesses b
     WHERE b.id = NEW.business_id AND b.is_blocked
  ) THEN
    -- Sin detalles: el saldo del restaurante no es asunto de quien pide.
    RAISE EXCEPTION 'Este restaurante no esta recibiendo pedidos en este momento.'
      USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_business_not_blocked ON public.orders;
CREATE TRIGGER trg_orders_business_not_blocked
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_reject_if_business_blocked();
