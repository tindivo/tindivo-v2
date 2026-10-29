-- ============================================================================
-- 0280 — las reseñas se piden y se dejan por la API (app nativa)
-- ============================================================================
--
-- PROBLEMA. La web pide la reseña pendiente, la deja y la descarta hablando directo con
-- Supabase: `get_pending_review()` y `create_order_review(...)` toman al cliente de
-- `auth.uid()`, y el descarte es un INSERT en `order_review_dismissals` bajo RLS. La app nativa
-- solo habla con la API REST (contrato REST v1), y la API usa el rol de servidor, con el que
-- `auth.uid()` es NULL. DB-4: una función que llama la API recibe el actor explícito y solo la
-- ejecuta `service_role`.
--
-- QUÉ HACE.
--   · `review_pending_for(p_actor_user_id)`, `create_order_review_for(p_actor_user_id, …)` y
--     `dismiss_order_review_for(p_actor_user_id, p_order_id)`: la lógica, con el actor
--     explícito. Solo `service_role` las ejecuta.
--   · `get_pending_review()` y `create_order_review(...)` (las de la web) pasan a delegar en
--     ellas con `auth.uid()`, y traducen los códigos de error a los mismos mensajes de siempre:
--     la web no cambia y la regla vive en un solo sitio.
--   · El descarte de la web sigue siendo el INSERT bajo RLS; la función nueva hace lo mismo.
--
-- REGLAS QUE SE CONSERVAN (0215, 0216): una reseña por pedido (`unique (order_id)`); solo un
-- pedido propio, entregado y dentro de la ventana (`app_settings.reviews.windowDays`); un pedido
-- ajeno y uno inexistente responden igual; las etiquetas fuera del catálogo se descartan y el
-- comentario se recorta a `commentMaxLength`; `order.reviewed` va a `order_event_log` sin el
-- texto; el pendiente es uno solo, el entregado más reciente sin reseña ni descarte. Las
-- Entregas (`courier_orders`) no tienen reseña. Una cuenta borrada no escribe: lo rechaza el
-- trigger de la 0259 en las dos tablas.
--
-- ERRORES (DB-16). Las funciones nuevas usan códigos de máquina: `order_not_found` (P0002),
-- `invalid_rating`, `order_not_delivered`, `review_window_closed` y `order_already_reviewed`
-- (P0001).
--
-- DB-18: las funciones leen `orders` y `businesses`, como ya lo hacían las de la 0215 y la 0216.
--
-- Idempotente. Rollback: supabase/rollbacks/0280_las_resenas_se_piden_por_la_api.rollback.sql
-- ============================================================================

-- ── 1. El pendiente ─────────────────────────────────────────────────────────
create or replace function public.review_pending_for(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $fn$
declare
  v_window_days int;
  v_tags        jsonb;
  v_row         jsonb;
begin
  if p_actor_user_id is null then
    return null;
  end if;

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
           'tags',            v_tags
         )
    into v_row
    from public.orders o
    join public.businesses b on b.id = o.business_id
   where o.customer_user_id = p_actor_user_id
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

comment on function public.review_pending_for(uuid) is
  'El pedido entregado más reciente del actor sin calificar ni descartar, con el catálogo de etiquetas. NULL si no hay. Solo service_role (DB-4).';

-- ── 2. Dejar la reseña ──────────────────────────────────────────────────────
create or replace function public.create_order_review_for(
  p_actor_user_id uuid,
  p_order_id      uuid,
  p_rating        smallint,
  p_tags          text[] default '{}'::text[],
  p_comment       text   default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order        public.orders;
  v_window_days  int;
  v_max_len      int;
  v_valid_tags   text[];
  v_tags         text[];
  v_comment      text;
  v_id           uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using errcode = 'P0001', message = 'invalid_rating';
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

  -- Pedido ajeno, inexistente o sin actor responden igual: no se confirma que exista.
  select * into v_order
    from public.orders
   where id = p_order_id
     and p_actor_user_id is not null
     and customer_user_id = p_actor_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  -- `delivered` es terminal (invariante 8): ninguna reseña queda colgando de un pedido que vuelve atrás.
  if v_order.status <> 'delivered' or v_order.delivered_at is null then
    raise exception using errcode = 'P0001', message = 'order_not_delivered';
  end if;

  if now() > v_order.delivered_at + (v_window_days || ' days')::interval then
    raise exception using errcode = 'P0001', message = 'review_window_closed';
  end if;

  -- Lo que no está en el catálogo se descarta en vez de fallar: editarlo en vivo no tumba un envío.
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
      (v_order.id, v_order.business_id, v_order.driver_id, p_actor_user_id,
       p_rating, v_tags, v_comment)
    returning id into v_id;
  exception when unique_violation then
    -- `unique (order_id)` es la guarda real contra el doble envío.
    raise exception using errcode = 'P0001', message = 'order_already_reviewed';
  end;

  -- Auditoría sin el comentario: el texto vive en un solo sitio.
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order.id, 'order.reviewed', 'cliente', p_actor_user_id,
          jsonb_build_object('reviewId', v_id, 'rating', p_rating,
                             'tags', to_jsonb(v_tags), 'hasComment', v_comment is not null));

  return jsonb_build_object('id', v_id, 'orderId', v_order.id, 'rating', p_rating);
end
$fn$;

comment on function public.create_order_review_for(uuid, uuid, smallint, text[], text) is
  'El actor califica un pedido entregado suyo dentro de la ventana. Una por pedido. Solo service_role (DB-4).';

-- ── 3. Descartar («Ahora no») ───────────────────────────────────────────────
-- Igual que el INSERT de la web bajo RLS: basta con que el pedido sea del actor. Repetirlo no
-- falla (devuelve false). Descartar solo apaga la pregunta; no impide calificar después.
create or replace function public.dismiss_order_review_for(
  p_actor_user_id uuid,
  p_order_id      uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_inserted int;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id and o.customer_user_id = p_actor_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  insert into public.order_review_dismissals (order_id, customer_user_id)
  values (p_order_id, p_actor_user_id)
  on conflict (order_id) do nothing;
  get diagnostics v_inserted = row_count;

  return v_inserted > 0;
end
$fn$;

comment on function public.dismiss_order_review_for(uuid, uuid) is
  'El actor descarta la pregunta por la reseña de un pedido suyo. Idempotente. Solo service_role (DB-4).';

-- ── 4. Las de la web delegan ────────────────────────────────────────────────
create or replace function public.get_pending_review()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $fn$
begin
  return public.review_pending_for(auth.uid());
end
$fn$;

comment on function public.get_pending_review() is
  'La de la web: review_pending_for con el usuario de la sesión. NULL si no hay pendiente.';

create or replace function public.create_order_review(
  p_order_id uuid,
  p_rating   smallint,
  p_tags     text[] default '{}'::text[],
  p_comment  text   default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado' using errcode = 'P0001';
  end if;

  begin
    return public.create_order_review_for(v_user_id, p_order_id, p_rating, p_tags, p_comment);
  exception
    when sqlstate 'P0002' then
      if sqlerrm = 'order_not_found' then
        raise exception 'Pedido no encontrado' using errcode = 'P0002';
      end if;
      raise;
    when sqlstate 'P0001' then
      -- Los mensajes que la web ya conoce (0215); cualquier otro error sigue tal cual.
      case sqlerrm
        when 'invalid_rating' then
          raise exception 'La nota debe estar entre 1 y 5' using errcode = 'P0001';
        when 'order_not_delivered' then
          raise exception 'Solo se puede calificar un pedido entregado' using errcode = 'P0001';
        when 'review_window_closed' then
          raise exception 'El plazo para calificar este pedido ya venció' using errcode = 'P0001';
        when 'order_already_reviewed' then
          raise exception 'Este pedido ya fue calificado' using errcode = 'P0001';
        else
          raise;
      end case;
  end;
end
$fn$;

comment on function public.create_order_review(uuid, smallint, text[], text) is
  'La de la web: create_order_review_for con el usuario de la sesión y los mensajes de la 0215.';

-- ── 5. Permisos ─────────────────────────────────────────────────────────────
-- La ACL no sobrevive al CREATE OR REPLACE y los default privileges de Supabase devuelven
-- EXECUTE a PUBLIC: se rehace entera en las cinco.
revoke all on function public.review_pending_for(uuid) from public, anon, authenticated;
grant execute on function public.review_pending_for(uuid) to service_role;

revoke all on function public.create_order_review_for(uuid, uuid, smallint, text[], text)
  from public, anon, authenticated;
grant execute on function public.create_order_review_for(uuid, uuid, smallint, text[], text)
  to service_role;

revoke all on function public.dismiss_order_review_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dismiss_order_review_for(uuid, uuid) to service_role;

revoke all on function public.get_pending_review() from public, anon, authenticated;
grant execute on function public.get_pending_review() to authenticated, service_role;

revoke all on function public.create_order_review(uuid, smallint, text[], text)
  from public, anon, authenticated;
grant execute on function public.create_order_review(uuid, smallint, text[], text)
  to authenticated, service_role;

-- ── 6. Comprobación: si los permisos no quedaron como deben, la migración falla ──
do $check$
declare
  v_fn   regprocedure;
  v_role text;
begin
  foreach v_fn in array array[
    'public.review_pending_for(uuid)'::regprocedure,
    'public.create_order_review_for(uuid, uuid, smallint, text[], text)'::regprocedure,
    'public.dismiss_order_review_for(uuid, uuid)'::regprocedure
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then
        raise exception '0280: % se puede ejecutar con %', v_fn, v_role;
      end if;
    end loop;
    if exists (
      select 1 from pg_proc p, aclexplode(p.proacl) a
       where p.oid = v_fn and a.privilege_type = 'EXECUTE' and a.grantee = 0
    ) then
      raise exception '0280: % se puede ejecutar con PUBLIC', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception '0280: service_role no puede ejecutar %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.get_pending_review()'::regprocedure,
    'public.create_order_review(uuid, smallint, text[], text)'::regprocedure
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '0280: % se puede ejecutar con anon', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '0280: authenticated ya no puede ejecutar %', v_fn;
    end if;
  end loop;
end
$check$;
