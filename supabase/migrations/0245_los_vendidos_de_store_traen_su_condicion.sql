-- ============================================================================
-- 0245 — Tindivo Store: «Vendidos recientemente» con la misma forma que la grilla
-- ============================================================================
--
-- `list_store_sold` (0242) devolvía un subconjunto de columnas sin `condition`,
-- y la capa de presentación descarta cualquier tarjeta a la que le falte
-- (prefiere no pintar nada a pintar «S/null»). Resultado: la sección de vendidos
-- llegaba bien de la API y salía vacía en la página.
--
-- Ahora devuelve las mismas columnas que `list_store_products`, para que una
-- tarjeta sea una tarjeta venga de donde venga.
--
-- Idempotente.
-- ============================================================================

create or replace function public.list_store_sold(p_limit int default 6)
  returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  from (
    select
      p.id, p.code, p.slug, p.title, p.price, p.original_price, p.is_clearance,
      p.negotiable, p.condition, p.condition_score, p.size_label, p.audience,
      p.status, p.cover_focus_x, p.cover_focus_y, p.sold_at,
      c.slug as category_slug, c.name as category_name,
      (select i.thumb_url from public.store_product_images i
        where i.product_id = p.id order by i.position limit 1) as thumb_url
    from public.store_products p
    left join public.store_categories c on c.id = p.category_id
    where p.status = 'sold'
    order by p.sold_at desc nulls last
    limit least(greatest(coalesce(p_limit, 6), 1), 6)
  ) t
$fn$;

-- CREATE OR REPLACE conserva los grants, pero se repiten por si la función se
-- recreara desde cero (REVOKE FROM PUBLIC no basta: ver 0242).
revoke execute on function public.list_store_sold(int) from public, anon, authenticated;
grant execute on function public.list_store_sold(int) to service_role;
