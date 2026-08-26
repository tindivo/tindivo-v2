-- =============================================================================
-- ROLLBACK de 0188 · El contador de la promo no es para todo internet
-- =============================================================================
--
-- ESTE ROLLBACK VUELVE A ABRIR EL CONTADOR A `anon`. Es la definición de
-- deshacer 0188, y por eso conviene decirlo con todas las letras: ejecutarlo
-- republica `admin_promo_free_delivery_stats` en
-- `/rest/v1/rpc/admin_promo_free_delivery_stats` para cualquiera con la anon key.
--
-- Solo tiene sentido si algo que SÍ debía llamar a estas funciones se rompió
-- por el revoke, y hace falta restablecer el servicio mientras se investiga.
-- El sospechoso sería un cliente que llame la RPC desde el navegador en vez de
-- por el route de admin — que es justo lo que 0188 quería impedir.
--
-- Antes de ejecutarlo, comprobar si el fallo real es otro:
--
--   -- ¿Quién puede ejecutarla ahora?
--   select proname, array_to_string(proacl, ' | ') from pg_proc
--    where proname = 'admin_promo_free_delivery_stats';
--
--   -- El route de admin usa el cliente de SERVICIO. Si falla con 401/403, el
--   -- problema es la sesión del admin, no estos grants.
-- =============================================================================

grant execute on function public.admin_promo_free_delivery_stats() to anon, authenticated;
grant execute on function public.promo_settle_redemption() to anon, authenticated;
grant execute on function public.current_customer_promo_free_delivery() to anon;

comment on function public.admin_promo_free_delivery_stats is
  'Consumo de la promo de envío: redenciones, corte nuevo/recurrente, cupos restantes y coste.';
