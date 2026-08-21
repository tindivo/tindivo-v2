-- ROLLBACK de 0178 — la suspensión por deuda vuelve a ser manual y un negocio
-- suspendido vuelve a poder recibir pedidos por enlace directo.
--
-- OJO: si algún negocio quedó suspendido POR ESTA REGLA, revertir la función no
-- lo suelta. Compruébalo y suéltalo a mano antes o después:
--
--   select id, name, balance_due, block_reason from public.businesses
--    where blocked_for_debt;
--   -- y para cada uno:  select public.unblock_business('<id>', '<tu-user-id>');
--
-- La clave `debt_block_threshold` se deja en `app_settings`: no molesta a nadie
-- y borrarla solo complicaría volver a aplicar la 0178.

DROP TRIGGER IF EXISTS trg_orders_business_not_blocked ON public.orders;
DROP FUNCTION IF EXISTS public.orders_reject_if_business_blocked();

CREATE OR REPLACE FUNCTION public.recalc_business_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_business_id uuid := COALESCE(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE public.businesses b
     SET balance_due = COALESCE((
           SELECT SUM(bc.amount)
             FROM public.business_charges bc
            WHERE bc.business_id = v_business_id
              AND bc.status = 'pending'
         ), 0)
   WHERE b.id = v_business_id;
  RETURN NULL;
END;
$fn$;
