-- ============================================================================
-- 0244 — Tindivo Store: reordenar fotos en una sola transacción
-- ============================================================================
--
-- Reordenar es intercambiar posiciones, y PostgREST hace un UPDATE por llamada:
-- a mitad de camino dos fotos comparten posición. La restricción
-- `store_product_images_position_key` es DEFERRABLE INITIALLY DEFERRED (0242)
-- justo para esto, pero solo ayuda dentro de UNA transacción, y esa es esta RPC.
--
-- Exige que `p_ids` sea EXACTAMENTE el conjunto de fotos del artículo: si faltara
-- una (por una subida que llegó entre medias) quedaría con posición repetida, y
-- preferimos un error claro a un orden a medias.
--
-- Idempotente.
-- ============================================================================

create or replace function public.reorder_store_images(p_product_id uuid, p_ids uuid[])
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_current uuid[];
begin
  -- Lock del producto: serializa contra subidas simultáneas (mismo lock que
  -- store_images_guard).
  perform 1 from public.store_products where id = p_product_id for update;
  if not found then
    raise exception 'store_product_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_current
    from public.store_product_images where product_id = p_product_id;

  if coalesce(array_length(p_ids, 1), 0) <> coalesce(array_length(v_current, 1), 0)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) <> v_current then
    raise exception 'store_images_order_mismatch' using errcode = 'P0001';
  end if;

  update public.store_product_images i
     set position = (o.ord - 1)::smallint
    from unnest(p_ids) with ordinality as o(id, ord)
   where i.id = o.id;
end;
$fn$;

revoke execute on function public.reorder_store_images(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_store_images(uuid, uuid[]) to service_role;
