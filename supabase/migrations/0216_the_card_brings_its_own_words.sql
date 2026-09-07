-- ============================================================================
-- 0216 — La tarjeta trae sus propias palabras
-- ============================================================================
--
-- EL HUECO QUE DEJÓ LA 0215. El catálogo de etiquetas vive en `app_settings`
-- justamente para poder cambiarlo sin desplegar, pero `app_settings` está
-- cerrada a RLS: el browser no puede leerla. Tal como quedó la 0215, la única
-- forma de pintar «Llegó fría» en la tarjeta era escribir esa palabra en el
-- código del cliente — que es exactamente lo que el catálogo venía a evitar.
--
-- LA SALIDA, Y POR QUÉ ESTA. `get_pending_review` ya lee `app_settings` para
-- sacar la ventana, así que devolver también las etiquetas no cuesta ni una
-- consulta más, y le ahorra al cliente una segunda ida. La alternativa —una RPC
-- `get_review_tags` aparte— sería otra función que revocar y conceder para
-- entregar cinco palabras.
--
-- Solo cambia la forma de la RESPUESTA. Ni tablas, ni policies, ni grants: la
-- ACL de la función se recrea igual abajo porque un CREATE OR REPLACE no la
-- conserva (0123, 0204).
--
-- Idempotente.
-- ============================================================================

create or replace function public.get_pending_review()
returns jsonb
  language plpgsql security definer stable set search_path = ''
as $fn$
declare
  v_user_id     uuid;
  v_window_days int;
  v_tags        jsonb;
  v_row         jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then return null; end if;

  select coalesce((value->>'windowDays')::int, 21),
         coalesce(value->'tags', '[]'::jsonb)
    into v_window_days, v_tags
    from public.app_settings where key = 'reviews';
  v_window_days := coalesce(v_window_days, 21);
  v_tags        := coalesce(v_tags, '[]'::jsonb);

  select jsonb_build_object(
           'orderId',         o.id,
           'shortId',         o.short_id,
           'businessId',      o.business_id,
           'businessName',    b.name,
           'businessLogoUrl', b.logo_url,
           'deliveredAt',     o.delivered_at,
           'closesAt',        o.delivered_at + (v_window_days || ' days')::interval,
           -- El catálogo viaja con el pendiente y no aparte: la tarjeta no se
           -- pinta sin él, y pedirlo por separado sería una ida para nada en el
           -- 100% de las veces que no hay pendiente.
           'tags',            v_tags
         )
    into v_row
    from public.orders o
    join public.businesses b on b.id = o.business_id
   where o.customer_user_id = v_user_id
     and o.status = 'delivered'
     and o.delivered_at is not null
     and o.delivered_at > now() - (v_window_days || ' days')::interval
     and not exists (select 1 from public.order_reviews r where r.order_id = o.id)
     and not exists (select 1 from public.order_review_dismissals d where d.order_id = o.id)
   order by o.delivered_at desc
   limit 1;

  return v_row;   -- null si no hay pendiente
end
$fn$;

comment on function public.get_pending_review() is
  'El pedido entregado más reciente del cliente sin calificar ni descartar, con el catálogo de etiquetas. NULL si no hay.';

-- La ACL no sobrevive al CREATE OR REPLACE y los default privileges de Supabase
-- devuelven EXECUTE a PUBLIC en cuanto queda vacía. Se rehace entera.
revoke all on function public.get_pending_review() from public, anon, authenticated;
grant execute on function public.get_pending_review() to authenticated, service_role;
