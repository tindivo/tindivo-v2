-- =============================================================================
-- 0233 · Las RPC de Tindivo Entregas dejan de fiarse de quien las llama
-- =============================================================================
--
-- QUÉ ARREGLA.
--   `get_advisors` (security) marcó `create_courier_order` y
--   `advance_courier_order` como ejecutables por `anon`/`authenticated` vía
--   `/rest/v1/rpc/...`. Ninguna de las dos valida que `p_customer_user_id` o
--   `p_actor_user_id` coincida con `auth.uid()` — confían en que la API
--   (`requireRole`, service_role) ya lo garantizó. Dejarlas ejecutables
--   directo habría permitido a cualquier cuenta autenticada crear una
--   solicitud a nombre de otro cliente, o avanzarla a nombre de otro
--   motorizado (aceptar/cancelar pedidos ajenos).
--
--   Mismo patrón que `create_customer_order` (0008/0009/0063/0105) y
--   `generate_short_id` (0008/0009): REVOKE explícito de `public, anon,
--   authenticated`, GRANT solo a `service_role`. `CREATE OR REPLACE FUNCTION`
--   no toca los grants existentes — por eso hace falta esta migración aparte
--   en vez de arreglarlo en la 0232.
--
-- QUÉ SE DEJA COMO ESTÁ (a propósito).
--   `courier_service_status`, `is_within_courier_schedule`,
--   `courier_has_available_driver`, `get_courier_tracking`,
--   `expire_courier_orders` siguen públicas: son de solo lectura o
--   idempotentes sin superficie de suplantación (mismo trato que
--   `get_tracking`, `point_in_coverage_polygon`, `cancel_expired_prepay_orders`
--   — todas aparecen igual en `get_advisors` y es aceptado).
-- =============================================================================

revoke execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text
) from public, anon, authenticated;

revoke execute on function public.advance_courier_order(
  uuid, uuid, text, public.courier_cancel_reason, text
) from public, anon, authenticated;

revoke execute on function public.generate_courier_short_id() from public, anon, authenticated;
grant execute on function public.generate_courier_short_id() to service_role;
