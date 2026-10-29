-- Rollback de 0280: las funciones de la web vuelven a su versión de la 0215 y la 0216, y se
-- borran las tres que recibe el actor. Antes, quitar de la API las rutas de reseñas: sin estas
-- funciones responden 500.

create or replace function public.create_order_review(
  p_order_id uuid,
  p_rating   smallint,
  p_tags     text[] default '{}'::text[],
  p_comment  text   default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user_id      uuid;
  v_order        public.orders;
  v_window_days  int;
  v_max_len      int;
  v_valid_tags   text[];
  v_tags         text[];
  v_comment      text;
  v_id           uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario no autenticado' using errcode = 'P0001';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'La nota debe estar entre 1 y 5' using errcode = 'P0001';
  end if;

  select coalesce((value->>'windowDays')::int, 21),
         coalesce((value->>'commentMaxLength')::int, 400),
         coalesce((select array_agg(t->>'id') from jsonb_array_elements(value->'tags') t),
                  '{}'::text[])
    into v_window_days, v_max_len, v_valid_tags
    from public.app_settings where key = 'reviews';
  v_window_days := coalesce(v_window_days, 21);
  v_max_len     := coalesce(v_max_len, 400);
  v_valid_tags  := coalesce(v_valid_tags, '{}'::text[]);

  -- Pedido ajeno o inexistente responden IGUAL (P0002 -> 404). No se confirma
  -- la existencia de pedidos de otros.
  select * into v_order
    from public.orders
   where id = p_order_id and customer_user_id = v_user_id;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  -- `delivered` es terminal (invariante 8): anclar aquí es seguro, no hay
  -- camino de vuelta que pueda invalidar una reseña ya dejada.
  if v_order.status <> 'delivered' or v_order.delivered_at is null then
    raise exception 'Solo se puede calificar un pedido entregado' using errcode = 'P0001';
  end if;

  if now() > v_order.delivered_at + (v_window_days || ' days')::interval then
    raise exception 'El plazo para calificar este pedido ya venció' using errcode = 'P0001';
  end if;

  -- Etiquetas: se descarta lo que no esté en el catálogo en vez de fallar. Un
  -- catálogo editado en vivo no puede tumbar el envío de un cliente.
  v_tags := coalesce((
    select array_agg(distinct t)
      from unnest(coalesce(p_tags, '{}'::text[])) t
     where t = any(v_valid_tags)
  ), '{}'::text[]);

  v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if v_comment is not null and length(v_comment) > v_max_len then
    v_comment := left(v_comment, v_max_len);
  end if;

  begin
    insert into public.order_reviews
      (order_id, business_id, driver_id, customer_user_id, rating, tags, comment)
    values
      (v_order.id, v_order.business_id, v_order.driver_id, v_user_id,
       p_rating, v_tags, v_comment)
    returning id into v_id;
  exception when unique_violation then
    -- `unique (order_id)` es la guarda real contra el doble envío (dos toques
    -- seguidos en el botón). Se traduce a un error de dominio limpio.
    raise exception 'Este pedido ya fue calificado' using errcode = 'P0001';
  end;

  -- Auditoría de negocio, no negociable desde el día 1. Sin el comentario:
  -- el texto vive en un solo sitio y no se replica al log.
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order.id, 'order.reviewed', 'cliente', v_user_id,
          jsonb_build_object('reviewId', v_id, 'rating', p_rating,
                             'tags', to_jsonb(v_tags), 'hasComment', v_comment is not null));

  -- Sin outbox: en Fase A nadie recibe push por una reseña. El negocio la ve
  -- cuando entra a su panel, y así el canal de push sigue siendo solo operativo.

  return jsonb_build_object('id', v_id, 'orderId', v_order.id, 'rating', p_rating);
end
$fn$;

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

revoke all on function public.get_pending_review() from public, anon, authenticated;
grant execute on function public.get_pending_review() to authenticated, service_role;
revoke all on function public.create_order_review(uuid, smallint, text[], text) from public, anon, authenticated;
grant execute on function public.create_order_review(uuid, smallint, text[], text) to authenticated, service_role;

drop function if exists public.review_pending_for(uuid);
drop function if exists public.create_order_review_for(uuid, uuid, smallint, text[], text);
drop function if exists public.dismiss_order_review_for(uuid, uuid);
