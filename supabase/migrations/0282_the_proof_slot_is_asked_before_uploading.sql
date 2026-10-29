-- =============================================================================
-- 0282 · Antes de subir el comprobante, el servidor pregunta si hay hueco
-- =============================================================================
--
-- QUÉ CAMBIA
-- Nace `prepay_proof_next_attempt(p_order_id, p_customer_user_id) -> int`: de SOLO
-- LECTURA, dice qué intento gastaría el próximo comprobante del pedido, o falla con
-- los MISMOS errores que `register_prepay_proof` (0248) usa para negarlo.
--
-- POR QUÉ
-- Las apps nativas no usan el SDK de Supabase (DES-1/DES-2), así que no pueden subir
-- a Storage con su JWT. `POST /customer/orders/{id}/prepay-proof/upload-url` autoriza
-- la subida y devuelve una URL firmada; antes de firmar, el servidor tiene que saber
-- si el pedido espera comprobante y cuántos intentos le quedan. Esa regla ya vive en
-- `register_prepay_proof`; aquí se consulta sin copiarla a TypeScript.
--
-- ERRORES (idénticos a los de 0248; la API los distingue por `hint`):
--   P0002                            · no existe, o no es de este cliente
--   P0001 / order_not_awaiting_proof · no está en `awaiting_payment` prepago
--   P0001 / proof_attempts_exhausted · ya hizo 2 intentos
--
-- LÍMITE CONOCIDO: la regla (estado `awaiting_payment` + `prepaid`, tope de 2
-- intentos) queda escrita en dos funciones. Si cambia, hay que cambiar las dos; el
-- test de integración de la ruta cubre ambas ramas contra la RPC real. Unificarlas
-- exigiría reemplazar `register_prepay_proof` (0248, aplicada, dinero adyacente): no
-- se toca en este cambio.
--
-- PERMISOS. Como `register_prepay_proof`, la llama la API con service role y le pasa
-- el id del usuario ya autenticado: EXECUTE solo para `service_role`.
--
-- No toca datos ni dinero. REVERSIBILIDAD:
--   DROP FUNCTION public.prepay_proof_next_attempt(uuid, uuid);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prepay_proof_next_attempt(
  p_order_id uuid,
  p_customer_user_id uuid
) RETURNS int
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  -- Dueño ajeno y pedido inexistente se responden igual: no se enumeran pedidos.
  IF NOT FOUND OR v_order.customer_user_id IS DISTINCT FROM p_customer_user_id THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'awaiting_payment' OR v_order.payment_intent <> 'prepaid' THEN
    RAISE EXCEPTION 'El pedido ya no espera comprobante'
      USING ERRCODE = 'P0001', HINT = 'order_not_awaiting_proof';
  END IF;

  IF v_order.proof_attempt >= 2 THEN
    RAISE EXCEPTION 'Límite de intentos de comprobante excedido'
      USING ERRCODE = 'P0001', HINT = 'proof_attempts_exhausted';
  END IF;

  RETURN v_order.proof_attempt + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.prepay_proof_next_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepay_proof_next_attempt(uuid, uuid) TO service_role;
