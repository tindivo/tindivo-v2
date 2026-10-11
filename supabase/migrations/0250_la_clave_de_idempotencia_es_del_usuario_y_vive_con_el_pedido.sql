-- ════════════════════════════════════════════════════════════════════════════
-- 0250 · La clave de idempotencia de una creación es DEL USUARIO
--
-- Hallazgos H-3 y H-4 de Docs/planes/movil/contrato-rest.md §2; paso 0(c) de §3
-- (lote C4 del plan diario).
--
-- EL DEFECTO. `idempotency_keys` (0002) tiene PK `(key, scope)`, sin usuario, y se
-- escribe en transacciones SEPARADAS de la del pedido: reservar, crear, guardar la
-- respuesta. Si el proceso cae entre medias, la clave se queda `reserved` hasta la
-- purga (24 h) —los reintentos reciben 409 «en proceso» aunque el pedido ya
-- exista— y DESPUÉS de la purga el mismo reintento crea OTRO pedido. Y como la
-- clave no lleva usuario, la de A reproduce la respuesta a B.
--
-- LA FORMA DEL ARREGLO (esta migración + 0251 + 0252):
--   · Tabla nueva `creation_idempotency`, PK `(user_id, scope, key)`: la clave es
--     del usuario; la misma clave de dos usuarios son dos claves.
--   · La fila se escribe DENTRO de la función que crea el pedido (0251), en la
--     misma transacción: o están el pedido y su clave, o no está ninguno. Ya no
--     existe el estado «reservada».
--   · La respuesta se guarda con la clave, así que un reintento la recupera sin
--     volver a ejecutar nada.
--   · Retención de 7 días y purga propia (0252).
--
-- POR QUÉ TABLA NUEVA y no cambiar la PK de `idempotency_keys`: esa tabla la usan
-- otras tres rutas (reclamos de fraude, incidentes, solicitud de traspaso) con
-- `ON CONFLICT (key, scope)`. Cambiar la PK antes de que el API nuevo esté
-- desplegado las rompería en producción entre el `db push` y el despliegue. Esta
-- migración es solo aditiva.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.creation_idempotency (
  user_id uuid not null,
  scope text not null check (scope in ('create_order', 'create_courier_order')),
  key uuid not null,
  request_hash text not null,
  -- La respuesta que se devolvió al crear (`data` de la RPC). Se escribe en la
  -- misma transacción que el pedido; el `{}` solo existe durante ella.
  response jsonb not null default '{}'::jsonb,
  -- Pedido (`orders.id` o `courier_orders.id`) que esta clave creó. Sin FK a
  -- propósito: son dos tablas y la purga de pedidos no debe depender de esto.
  resource_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (user_id, scope, key)
);

comment on table public.creation_idempotency is
  'Idempotencia de la CREACION de pedidos (restaurantes y Entregas). PK (user_id, scope, key): la clave es del usuario. Se escribe dentro de create_order_idempotently, en la misma transaccion que el pedido. RLS ACTIVADA y SIN POLICIES a proposito: solo la tocan las funciones SECURITY DEFINER y el API con service_role. No anadir policies: guarda cuerpos de respuesta ya emitidos.';

create index if not exists ci_expires_idx on public.creation_idempotency (expires_at);

alter table public.creation_idempotency enable row level security;

-- Los default privileges de Supabase dejan la tabla abierta a anon/authenticated
-- (la RLS sin policies ya niega, pero el permiso de tabla tampoco debe existir).
revoke all on table public.creation_idempotency from public, anon, authenticated;
grant select, insert, update, delete on table public.creation_idempotency to service_role;
