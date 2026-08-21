-- =============================================================================
-- 0179 · El límite de crédito vuelve a ser un cartel
-- =============================================================================
--
-- QUÉ CAMBIA
-- `recalc_business_balance()` deja de suspender por deuda: vuelve a hacer solo
-- lo que hacía antes de la `0178`, recalcular `balance_due` desde el ledger.
--
-- POR QUÉ
-- Decisión de producto, tomada tras ver el coste real del automatismo. La 0178
-- cortaba el servicio sola al llegar al umbral, y en el piloto eso significaba
-- que un negocio podía quedarse sin vender un viernes por la noche sin que
-- ninguna persona lo hubiera decidido — y encima **en silencio**, porque
-- `dispatch_event` clasifica `BusinessBlocked` como evento de auditoría y no lo
-- convierte en push. La cajera solo habría visto que el tablero se queda quieto.
--
-- Así que el umbral se queda donde estaba conceptualmente: un aviso. La barra de
-- «Límite de crédito» del panel enseña S/600 y el porcentaje consumido, y quien
-- decide suspender sigue siendo el admin, con su botón y su motivo.
--
-- QUÉ **NO** se revierte, y conviene saberlo:
--
--   1. `app_settings.debt_block_threshold` (600) SE QUEDA. Ya no bloquea nada,
--      pero es de donde el panel saca el número que pinta. Antes ese valor
--      estaba escrito a mano en `apps/negocios/.../constants.ts`; tenerlo en la
--      base es mejor que como estaba, y es lo que pide CLAUDE.md para
--      parámetros operativos. **Cambiarlo ya no suspende a nadie: solo mueve el
--      cartel.**
--
--   2. `trg_orders_business_not_blocked` SE QUEDA, y esto es deliberado.
--      Ese trigger no tiene nada que ver con la deuda: impide que un negocio ya
--      suspendido reciba pedidos nuevos. Tapa un agujero que existía desde
--      antes y que es independiente de esta decisión — `is_published_business`
--      y `search_catalog` excluyen al suspendido, y
--      `create_business_manual_order` lo rechaza, pero `create_customer_order`
--      NO lo miraba: solo comprobaba el bloqueo del cliente. Como desde la 0165
--      la página del negocio se comparte por slug, cualquiera con el enlace en
--      WhatsApp podía seguir pidiéndole a un negocio suspendido, y el botón
--      «Suspender» del admin era medio decorativo.
--
--      Con la 0178 revertida, ese trigger solo puede dispararse por una
--      suspensión que haya decidido una persona. Si prefieres que el botón del
--      admin vuelva a no cortar los pedidos por enlace directo, hay que quitarlo
--      a mano; no se va con esta migración.
--
-- REVERSIBILIDAD: para volver a activar el corte automático, reaplica la 0178.

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

-- Si la 0178 llegó a suspender a alguien antes de esta reversión, se le suelta:
-- la regla que lo bloqueó ya no existe y nadie decidió esa suspensión.
UPDATE public.businesses
   SET is_blocked = false, blocked_for_debt = false, block_reason = null
 WHERE blocked_for_debt = true
   AND block_reason LIKE 'Suspension automatica%';
