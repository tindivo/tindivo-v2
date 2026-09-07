-- ============================================================================
-- 0215 — El cliente puede decir cómo le fue
-- ============================================================================
--
-- QUÉ ES. La captura de reseñas: una nota de 1 a 5, etiquetas y un comentario
-- opcional, colgados de un pedido entregado. Fase A: NADA de esto es público.
-- Lo ve el negocio (nota y etiquetas) y el admin (todo). El catálogo no cambia.
--
-- POR QUÉ NO SE PREGUNTA AL ENTREGAR. Porque no funciona: el cliente cierra la
-- app y se va a comer. La pregunta se hace la siguiente vez que pide, mientras
-- espera el pedido nuevo. Medido contra prod el 2026-09-06, eso alcanza al 83%
-- de los pedidos con cuenta (34 de 41 vienen de alguien que volvió a pedir), y
-- la brecha entre pedidos del mismo cliente es de 2 días en mediana, 7.4 en
-- p90 y 14 el máximo observado. De ahí salen los 21 días de ventana: cubren el
-- 100% de las brechas reales con margen, y a los 21 días el pedido caduca en
-- silencio porque de un pollo de hace un mes ya nadie se acuerda.
--
-- LO QUE NO SE CONSTRUYE, A PROPÓSITO. Ni columnas derivadas de promedio en
-- `businesses`, ni trigger de recálculo, ni estados de moderación, ni réplica
-- del negocio, ni `updated_at`. Nada de eso tiene lector en Fase A y sería
-- estado que mantener a ciegas. La fuente de verdad es esta tabla: cuando la
-- Fase B necesite el promedio en la ruta caliente del catálogo, se añaden las
-- columnas con su recálculo y su backfill, y no se pierde nada.
--
-- Idempotente.
-- ============================================================================

-- ── 1. order_reviews ────────────────────────────────────────────────────────
-- Inmutable, como `order_status_history`: sin `updated_at` y sin policy de
-- UPDATE. Se deja una vez y se queda como se dejó.
--
-- Cuelga del PEDIDO, no del negocio: `unique (order_id)` es lo único que hace
-- falta contra el brigading. Para opinar hay que haber pagado y recibido.
--
-- `business_id` y `driver_id` son SNAPSHOT, no derivados. El pedido puede
-- transferirse de motorizado (`order_transfer_requests`), y la reseña habla de
-- quien entregó, no de quien figure meses después. Con una sola nota, además,
-- `driver_id` y `tags` cargan solos el diagnóstico: son lo único que dice si
-- fue la cocina o la moto.
create table if not exists public.order_reviews (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders(id) on delete cascade,
  business_id      uuid not null references public.businesses(id),
  driver_id        uuid references public.drivers(id),
  customer_user_id uuid references public.users(id) on delete set null,

  rating           smallint not null check (rating between 1 and 5),
  tags             text[] not null default '{}'::text[],
  comment          text check (comment is null or length(comment) <= 400),

  created_at       timestamptz not null default now()
);
comment on table public.order_reviews is
  'Reseña del cliente sobre un pedido entregado. Una por pedido, inmutable. Fase A: no pública.';

-- El panel del negocio lee por negocio y fecha; el admin, la bandeja completa.
create index if not exists order_reviews_business_idx
  on public.order_reviews (business_id, created_at desc);
-- Señal operativa: qué motorizado acumula notas bajas.
create index if not exists order_reviews_driver_idx
  on public.order_reviews (driver_id, created_at desc) where driver_id is not null;
-- El pendiente del cliente se resuelve por aquí (anti-join contra sus pedidos).
create index if not exists order_reviews_customer_idx
  on public.order_reviews (customer_user_id) where customer_user_id is not null;

-- Sin índice GIN en `tags`: a este volumen no se filtra por etiqueta, y un GIN
-- que nadie usa es escritura más cara en cada reseña.

-- ── 2. order_review_dismissals ──────────────────────────────────────────────
-- "Ahora no" NO es "no quiero opinar": cierra la pregunta, no la ventana. Si el
-- cliente entra por su cuenta desde el historial, todavía puede calificar.
--
-- Existe como tabla y no como columna en `orders` por dos razones: `orders` es
-- el agregado caliente y no se ensucia con esto, y aquí sí es dato self-scoped
-- no sensible, así que el descarte lo escribe el browser directo por RLS — sin
-- RPC y sin pagar el salto a la API.
--
-- Y es el instrumento de la decisión de Fase B: sin él solo sabrías cuántas
-- reseñas tienes, no cuántas veces preguntaste para conseguirlas.
create table if not exists public.order_review_dismissals (
  order_id         uuid primary key references public.orders(id) on delete cascade,
  customer_user_id uuid not null references public.users(id) on delete cascade,
  dismissed_at     timestamptz not null default now()
);
comment on table public.order_review_dismissals is
  'El cliente dijo «ahora no» a la tarjeta de reseña. Cierra la pregunta, no la ventana.';

create index if not exists order_review_dismissals_customer_idx
  on public.order_review_dismissals (customer_user_id);

-- ── 3. Parámetros operativos (nada de hardcode) ─────────────────────────────
-- El catálogo de etiquetas vive aquí para poder ajustarlo sin desplegar. Se
-- ordenan de "salió bien" a "salió mal" a propósito: la primera opción que ve
-- el cliente no debe ser una queja.
insert into public.app_settings (key, value)
values (
  'reviews',
  '{
    "windowDays": 21,
    "commentMaxLength": 400,
    "tags": [
      {"id": "todo_bien",  "label": "Todo bien"},
      {"id": "buen_trato", "label": "Buen trato"},
      {"id": "demoro",     "label": "Demoró"},
      {"id": "llego_fria", "label": "Llegó fría"},
      {"id": "falto_algo", "label": "Faltó algo"}
    ]
  }'::jsonb
)
on conflict (key) do nothing;   -- no pisa un catálogo ya ajustado en vivo

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- Modelo de 0004: escritura directa SOLO para self-scoped no sensible. Una
-- reseña toca la reputación de un tercero y tiene que validar ventana, estado y
-- unicidad en una sola transacción, así que va por RPC: sin policy de INSERT.
-- El descarte sí es self-scoped, y ese sí se escribe directo.
--
-- Helpers envueltos en (select ...) para que el planner los evalúe una vez por
-- query, como el resto de 0004.
alter table public.order_reviews enable row level security;
alter table public.order_review_dismissals enable row level security;

-- order_reviews · admin
drop policy if exists order_reviews_admin_all on public.order_reviews;
create policy order_reviews_admin_all on public.order_reviews for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

-- order_reviews · el cliente lee la suya (para rehidratar "ya calificaste")
drop policy if exists order_reviews_customer_read on public.order_reviews;
create policy order_reviews_customer_read on public.order_reviews for select to authenticated
  using (customer_user_id = (select auth.uid()));

-- order_reviews · el dueño lee las de su negocio.
-- Ve la fila entera, incluido `comment`. Que el TEXTO no llegue al panel del
-- negocio en Fase A es decisión de la CAPA DE LECTURA (el endpoint selecciona
-- rating y tags, no comment), no de RLS: el día que se abra el comentario no
-- hace falta tocar policies.
drop policy if exists order_reviews_business_read on public.order_reviews;
create policy order_reviews_business_read on public.order_reviews for select to authenticated
  using (business_id = (select public.current_business_id()));

-- Sin policy pública: en Fase A no hay lectura anónima de reseñas.
-- Sin policy de INSERT/UPDATE/DELETE para nadie salvo admin: alta por RPC,
-- y la reseña es inmutable.

-- order_review_dismissals · admin
drop policy if exists order_review_dismissals_admin_all on public.order_review_dismissals;
create policy order_review_dismissals_admin_all on public.order_review_dismissals
  for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

-- order_review_dismissals · el cliente escribe y lee el suyo.
-- El `with check` ata la fila a quien la escribe; que el pedido sea realmente
-- suyo lo garantiza el `exists`, si no cualquiera podría marcar como descartado
-- el pedido de otro y apagarle la pregunta.
drop policy if exists order_review_dismissals_self_read on public.order_review_dismissals;
create policy order_review_dismissals_self_read on public.order_review_dismissals
  for select to authenticated
  using (customer_user_id = (select auth.uid()));

drop policy if exists order_review_dismissals_self_insert on public.order_review_dismissals;
create policy order_review_dismissals_self_insert on public.order_review_dismissals
  for insert to authenticated
  with check (
    customer_user_id = (select auth.uid())
    and exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.customer_user_id = (select auth.uid())
    )
  );

-- ── 5. Grants de tabla ──────────────────────────────────────────────────────
revoke all on table public.order_reviews from public, anon, authenticated;
revoke all on table public.order_review_dismissals from public, anon, authenticated;
grant all on table public.order_reviews to service_role;
grant all on table public.order_review_dismissals to service_role;
-- Lo que RLS permite necesita además el grant. Solo lo que se usa:
grant select on table public.order_reviews to authenticated;
grant select, insert on table public.order_review_dismissals to authenticated;
-- `anon` no toca ninguna de las dos.

-- ── 6. RPC: dejar la reseña ─────────────────────────────────────────────────
-- Se invoca con el TOKEN DEL CLIENTE (createUserClient), como create_appeal_report.
-- Valida en una sola transacción lo que `reviewEligibility` valida en TS —esa
-- copia es para pintar la tarjeta sin ida y vuelta; la que manda es esta.
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

comment on function public.create_order_review(uuid, smallint, text[], text) is
  'El cliente califica un pedido entregado suyo dentro de la ventana. Una por pedido.';

-- ── 7. RPC: por cuál pedido preguntar ───────────────────────────────────────
-- Una sola ida contra Postgres desde el browser, en vez de un endpoint de API
-- (que cuesta 470-750 ms de piso aunque no toque la base). Devuelve NULL si no
-- hay nada que preguntar — nunca una tarjeta vacía.
--
-- El más reciente y solo uno. Nunca una cola: tres preguntas seguidas no dan
-- tres reseñas, dan cero y un cliente molesto.
create or replace function public.get_pending_review()
returns jsonb
  language plpgsql security definer stable set search_path = ''
as $fn$
declare
  v_user_id     uuid;
  v_window_days int;
  v_row         jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then return null; end if;

  select coalesce((value->>'windowDays')::int, 21) into v_window_days
    from public.app_settings where key = 'reviews';
  v_window_days := coalesce(v_window_days, 21);

  select jsonb_build_object(
           'orderId',         o.id,
           'shortId',         o.short_id,
           'businessId',      o.business_id,
           'businessName',    b.name,
           'businessLogoUrl', b.logo_url,
           'deliveredAt',     o.delivered_at,
           'closesAt',        o.delivered_at + (v_window_days || ' days')::interval
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
  'El pedido entregado más reciente del cliente sin calificar ni descartar. NULL si no hay.';

-- ── 8. Grants de función ────────────────────────────────────────────────────
-- Un CREATE OR REPLACE no conserva la ACL, y los default privileges de Supabase
-- devuelven EXECUTE a PUBLIC en cuanto queda vacía. Es la trampa de 0123 y 0204:
-- se revoca de las tres procedencias antes de conceder.
revoke all on function public.create_order_review(uuid, smallint, text[], text)
  from public, anon, authenticated;
revoke all on function public.get_pending_review() from public, anon, authenticated;

grant execute on function public.create_order_review(uuid, smallint, text[], text)
  to authenticated, service_role;
grant execute on function public.get_pending_review() to authenticated, service_role;
-- `anon` no: el link público de tracking no califica.
