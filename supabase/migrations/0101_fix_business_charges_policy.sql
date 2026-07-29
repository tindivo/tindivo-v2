-- 0101_fix_business_charges_policy.sql
--
-- QUÉ BUG CORRIGE
-- La policy `Service role can manage charges` sobre `public.business_charges` se creó en
-- `0073_business_charges_table_and_triggers.sql:66-70` SIN cláusula `TO`:
--
--     CREATE POLICY "Service role can manage charges"
--       ON public.business_charges FOR ALL
--       USING (true)
--       WITH CHECK (true);
--
-- En Postgres, una policy sin `TO` aplica a `PUBLIC`, es decir a TODOS los roles. El nombre
-- dice "Service role" pero la restricción nunca se escribió. Combinado con los privilegios
-- de tabla que `anon` tiene sobre `business_charges`, el resultado es que la anon key del
-- browser podía leer y ESCRIBIR el ledger de dinero.
--
-- `business_charges` es, según AGENTS.md §2.2, la ÚNICA fuente de verdad de la deuda de los
-- restaurantes. Escritura anónima sobre esa tabla permite fabricar, alterar o borrar deuda.
--
-- EVIDENCIA (medida en local, 28/07/2026, sobre una DB reconstruida con 0100 aplicada)
-- Simulando el rol `anon` con `SET LOCAL ROLE anon`, las tres operaciones tuvieron éxito:
--   INSERT ... VALUES (..., 'commission', 999.99, ...)  -> INSERT 0 1  (fila creada)
--   UPDATE ... SET amount = 0.01                        -> UPDATE 1    (monto alterado)
--   DELETE FROM public.business_charges ...             -> DELETE 1    (fila eliminada)
-- El ledger quedó en 0 filas. Control de escritura total desde `anon`.
--
-- ⚠️  ESTA MIGRACIÓN NO ES NO-OP EN PRODUCCIÓN
-- A diferencia de 0100 (que solo declaraba el estado existente), esta SÍ cambia el
-- comportamiento de prod, de forma intencional: es un fix de seguridad. Tras aplicarla,
-- `anon` y `authenticated` dejan de poder escribir `business_charges` vía PostgREST.
--
-- POR QUÉ NO ROMPE EL ACCESO LEGÍTIMO
--   1. `service_role` tiene `rolbypassrls = true` (verificado en local Y en prod). Ignora RLS
--      por completo, así que esta policy nunca fue lo que le daba acceso — seguirá pudiendo
--      gestionar charges exactamente igual. De hecho la policy era inútil para `service_role`:
--      su único efecto real era abrir la tabla a los demás roles.
--   2. Las 6 funciones que escriben el ledger son SECURITY DEFINER y propiedad de `postgres`
--      (que también tiene `rolbypassrls`): generate_delivery_charges,
--      handle_prepaid_cancel_auto_debt, handle_prepaid_refund_on_cancel, register_appeal_refund,
--      resolve_fraud_claim, settle_business_charges. Escriben con los privilegios del dueño,
--      no con los del rol que llama, así que no dependen de esta policy.
--   3. La lectura del negocio sobre sus propios charges la cubre la otra policy,
--      `Business can view own charges` (FOR SELECT, filtrada por `auth.uid()`), que NO se toca.
--
-- NO SE TOCA (fuera del alcance de este fix)
--   · `Business can view own charges` también está declarada a PUBLIC, pero su USING filtra
--     por `auth.uid()`, que es NULL para `anon` — no filtra nada hacia afuera. Es SELECT-only
--     y está correctamente acotada. Restringirla a `authenticated` sería higiene, no un fix.
--
-- No se edita 0073: las migraciones aplicadas son inmutables (AGENTS.md §2.1).
-- Idempotente: DROP IF EXISTS + CREATE.

drop policy if exists "Service role can manage charges" on public.business_charges;

create policy "Service role can manage charges"
  on public.business_charges
  for all
  to service_role
  using (true)
  with check (true);
