-- =============================================================================
-- 0122 · El directorio de direcciones pertenece a un telefono, no a un usuario
-- =============================================================================
--
-- Tindivo v1 (tindivo-delivery) acumulo 664 direcciones de clientes que nunca se
-- registraron: las levantaron los motorizados al entregar y las curo el admin a
-- mano. Ese directorio es el activo operativo mas valioso del piloto — es lo que
-- permite que la cajera escriba un telefono y le salga la dirección. Se migra a
-- v2 con un ETL de una sola corrida (Docs/spec/spec_manual.md).
--
-- POR QUE UNA TABLA NUEVA Y NO `customer_addresses`
--   `public.customer_addresses` ya existe en v2 y es OTRA COSA: la libreta de un
--   cliente REGISTRADO (`user_id uuid NOT NULL`, con `label` tipo "Casa"). El
--   directorio es de gente sin cuenta, indexado por telefono y compartido por
--   los cuatro negocios. Fusionarlos obligaria a hacer `user_id` nullable y a
--   escribir una policy RLS condicional sobre columna nullable, cuyo modo de
--   falla es que un cliente vea direcciones de otro. Con dos tablas cada policy
--   es de una linea.
--
-- COORDENADAS EN `double precision`, NO `numeric`
--   El sensor GPS y Leaflet producen floats. Guardar al centimetro un dato que
--   trae 20 m de incertidumbre es precision falsa. Los cruces hacia `orders`,
--   hacia la libreta B2C y hacia `point_in_coverage_polygon` llevan `::numeric`
--   explicito — documentado en el spec, seccion "Tipos de coordenadas".
--
-- LOS CHECK SALEN DE DATOS MEDIDOS, NO DE SUPUESTOS
--   Las 368 direcciones con GPS del legacy caen en
--   lat [-9.15501, -9.13729] x lng [-78.28532, -78.27360]. La caja de abajo les
--   deja ~5 km de holgura a cada lado y aun asi rechaza los fixes por IP que
--   contaminaron `orders` en el legacy (uno en -8.09/-79.04, a 144 km).
--   `accuracy_m` prohibe el 0 y el 999 porque ambos son centinelas del legacy,
--   no mediciones: 49 filas con 0 (reconfirmacion con `accuracy` hardcodeado) y
--   20 con 999 (el GPS fallo y se planto el pin en el centro del pueblo).
--
-- =============================================================================

-- ── 1 · El tipo -------------------------------------------------------------
-- Tres valores: QUIEN toco la fila por ultima vez, no COMO se capturo.
-- El metodo de captura se deduce de `accuracy_m` (numero = sensor, NULL = pin
-- arrastrado a mano), lo cual solo funciona si el codigo de v2 nunca escribe
-- los centinelas 0 ni 999. El CHECK de abajo lo hace imposible.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'address_source') then
    create type public.address_source as enum (
      'backfill',
      'driver_verified',
      'admin_curated'
    );
  end if;
end $$;


-- ── 2 · La tabla ------------------------------------------------------------
create table if not exists public.address_directory (
  id                uuid primary key default gen_random_uuid(),

  -- identidad
  phone             text not null,
  customer_name     text,
  reference         text not null,

  -- geo
  lat               double precision,
  lng               double precision,
  accuracy_m        double precision,

  -- metadatos operativos
  source            public.address_source not null,
  is_default        boolean not null default false,
  times_used        integer not null default 0,
  last_used_at      timestamptz,

  -- auditoria
  updated_by        uuid references public.users(id) on delete set null,

  -- trazabilidad de la importacion.
  -- NULL en las tres = fila nacida en v2. No-NULL = vino del ETL del legacy.
  legacy_address_id uuid,
  legacy_created_at timestamptz,
  imported_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint address_directory_phone_check
    check (phone ~ '^9\d{8}$'),

  -- lat y lng van juntos o no van
  constraint address_directory_coords_paired
    check ((lat is null) = (lng is null)),

  -- Caja de San Jacinto con 4-5 km de holgura (4.1 km al norte, 5.0 al sur,
  -- 4.8-4.9 al este y oeste). Rechaza los fixes por IP que contaminaron el
  -- legacy.
  -- OJO, es una frontera dura: rechaza TODA coordenada fuera de la caja, sea
  -- basura o no. Un GPS legitimo y preciso lejos del pueblo tambien se rechaza
  -- — en el legacy hubo dos pedidos a 11.5 km con accuracy de 12 m, reales.
  -- Es aceptable porque el poligono de cobertura tiene ~1.3 km de radio, pero
  -- el INSERT lanza excepcion: quien capture direcciones debe tratarla, no
  -- dejar que tumbe la entrega.
  constraint address_directory_coords_bbox
    check (
      lat is null or (
        lat between -9.20 and -9.10 and
        lng between -78.33 and -78.23
      )
    ),

  -- nunca 0 (artefacto), nunca 999 (centinela), nunca >=1000 (fix por IP).
  -- El 999 se excluye por RANGO y no por igualdad: `accuracy_m` es
  -- double precision, y `<> 999` deja pasar un 999.0000001. La banda de +-0.5
  -- no puede colisionar con una medicion legitima — de las 197 lecturas
  -- genuinas del legacy, solo 2 superaban los 500 m.
  constraint address_directory_accuracy_check
    check (
      accuracy_m is null
      or (
        accuracy_m > 0
        and accuracy_m < 1000
        and accuracy_m not between 998.5 and 999.5
      )
    ),

  -- sin coordenada no puede haber precision
  constraint address_directory_accuracy_needs_coords
    check (accuracy_m is null or lat is not null),

  -- O vino del ETL, o nacio aqui. Ata SOLO `imported_at` con
  -- `legacy_address_id`: `legacy_created_at` queda libre a proposito, porque
  -- el dedup puede consolidar un grupo cuyo MIN(created_at) no exista.
  -- No leer esto como "rastro completo": no lo garantiza.
  constraint address_directory_import_paired
    check ((imported_at is null) = (legacy_address_id is null))
);

comment on table public.address_directory is
  'Directorio operativo de direcciones, indexado por telefono y compartido por '
  'todos los negocios. NO confundir con public.customer_addresses, que es la '
  'libreta de un cliente registrado.';

comment on column public.address_directory.source is
  'Rol que toco la fila por ultima vez. El metodo de captura se deduce de '
  'accuracy_m: numero = sensor GPS, NULL = pin arrastrado a mano.';

comment on column public.address_directory.imported_at is
  'NULL = fila nacida en v2. No-NULL = vino del ETL del legacy.';


-- ── 3 · Indices -------------------------------------------------------------

-- Lookup del autocompletado de la cajera
create index if not exists address_directory_phone_idx
  on public.address_directory (phone);

-- Maximo una principal por telefono
create unique index if not exists address_directory_default_unique
  on public.address_directory (phone) where is_default;

-- Idempotencia del ETL: una segunda corrida falla en vez de duplicar
create unique index if not exists address_directory_legacy_id_unique
  on public.address_directory (legacy_address_id)
  where legacy_address_id is not null;

-- NOTA: el indice anti-duplicados (phone, reference normalizada) NO va aqui.
-- Se crea en la PARTE 4 del ETL, despues de validar que el dedup del import
-- colapso lo esperado (~2 filas). Crearlo antes haria fallar el INSERT masivo
-- sin dejar ver que fue lo que choco.


-- ── 4 · updated_at ----------------------------------------------------------
drop trigger if exists touch_address_directory on public.address_directory;
create trigger touch_address_directory
  before update on public.address_directory
  for each row execute function public.touch_updated_at();


-- ── 5 · RLS -----------------------------------------------------------------
-- Sigue el idioma de 0004_rls.sql: current_user_has_role envuelta en subselect.
alter table public.address_directory enable row level security;

-- Lectura: los tres roles operativos. El directorio es global por diseño.
drop policy if exists address_directory_select on public.address_directory;
create policy address_directory_select on public.address_directory
  for select using (
    (select public.current_user_has_role('admin'))
    or (select public.current_user_has_role('business'))
    or (select public.current_user_has_role('driver'))
  );

-- Escritura: solo motorizado y admin.
-- La cajera NO escribe en el directorio. Edita el snapshot del pedido; el
-- directorio lo corrige quien estuvo parado en la puerta. En el legacy esto
-- era un efecto lateral de la RLS; aqui es una decision declarada.
drop policy if exists address_directory_insert on public.address_directory;
create policy address_directory_insert on public.address_directory
  for insert with check (
    (select public.current_user_has_role('admin'))
    or (select public.current_user_has_role('driver'))
  );

drop policy if exists address_directory_update on public.address_directory;
create policy address_directory_update on public.address_directory
  for update
  using (
    (select public.current_user_has_role('admin'))
    or (select public.current_user_has_role('driver'))
  )
  with check (
    (select public.current_user_has_role('admin'))
    or (select public.current_user_has_role('driver'))
  );

-- Sin policy de DELETE: nadie borra direcciones.


-- ── 6 · Punteros y montos en `orders` ---------------------------------------

-- Puntero al directorio. El snapshot del pedido manda para mostrar e imprimir;
-- este puntero solo sirve para saber a QUE FILA escribirle el GPS al entregar.
-- Re-emparejar por telefono se rompe en cuanto un cliente tiene dos direcciones
-- (58 de 595 telefonos las tienen, medido).
alter table public.orders
  add column if not exists address_directory_id uuid
  references public.address_directory(id) on delete set null;

create index if not exists orders_address_directory_id_idx
  on public.orders (address_directory_id)
  where address_directory_id is not null;

-- Quien decidio la tarifa de delivery.
-- NO se agregan columnas de monto: `orders.order_amount` (solo comida) y
-- `orders.delivery_fee` (lo que paga el cliente) ya existen desde 0002 con esa
-- semantica exacta. Esta es la unica columna de dinero que faltaba.
alter table public.orders
  add column if not exists delivery_fee_source text
  check (delivery_fee_source is null or delivery_fee_source in ('business', 'system'));

comment on column public.orders.delivery_fee_source is
  'business = la eligio la cajera; system = default del camino B2C. '
  'Permite auditar despues por que un pedido cobro distinto.';
