-- ROLLBACK de 0175 — `cancel_expired_prepay_orders()` vuelve a ser ejecutable
-- por `anon`, o sea sin iniciar sesión.
--
-- No devuelve ninguna funcionalidad: los dos que la llaman de verdad son el
-- pg_cron (que corre dentro de Postgres, sin pasar por PostgREST) y el panel de
-- la cajera (que va autenticado). Solo devuelve el aviso del advisor.
--
-- No se restaura el `EXECUTE` de `PUBLIC`: el GRANT explícito a los tres roles
-- deja el mismo acceso efectivo que había, sin el comodín.

GRANT EXECUTE ON FUNCTION public.cancel_expired_prepay_orders()
  TO anon, authenticated, service_role;
