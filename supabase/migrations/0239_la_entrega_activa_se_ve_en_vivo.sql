-- ════════════════════════════════════════════════════════════════════════════
-- 0239 · La entrega activa se ve en vivo
--
-- `courier_orders` nunca entró a la publicación `supabase_realtime` (la 0005
-- añadió `orders` y compañía; la 0232 creó la tabla y no la sumó). El cliente
-- abría DOS canales sobre ella —`lib/active-courier-orders.ts` (banner
-- «Entrega en curso» del home y badge de «Pedidos») y el seguimiento— y
-- ninguno recibió jamás un evento. El seguimiento se salvaba por su sondeo de
-- 8 s; el banner y el badge no tenían sondeo, así que quien pedía una entrega
-- y volvía al home no la veía hasta recargar la página.
--
-- La RLS sigue mandando: Realtime solo entrega a cada sesión las filas que su
-- policy de SELECT le deja ver (el cliente, las suyas; el motorizado, las que
-- tiene asignadas).
--
-- Idempotente: mismo bloque que la 0005, tolera que ya esté en la publicación.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  alter publication supabase_realtime add table public.courier_orders;
exception when duplicate_object then null;
end $$;
