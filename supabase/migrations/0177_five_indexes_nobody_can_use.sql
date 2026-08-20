-- =============================================================================
-- 0177 · Cinco índices que nadie puede usar, y una policy que se reevalúa por fila
--
-- Idempotente. Rollback en supabase/rollbacks/0177_five_indexes_nobody_can_use.rollback.sql
-- =============================================================================
--
-- CUATRO DUPLICADOS QUE EL LINTER NO VE
-- `get_advisors` no detecta índices redundantes. Hay que buscarlos comparando
-- columnas, método y predicado sobre `pg_index`, y así aparecieron estos cuatro
-- — entre ellos los DOS ÍNDICES MÁS ESCANEADOS DE TODA LA BASE:
--
--   drivers_user_id_idx    (37.606 escaneos)  ⊂ drivers_user_id_key    [único]
--   businesses_user_id_idx (15.976 escaneos)  ⊂ businesses_user_id_key [único]
--   orders_short_id_idx    (   707 escaneos)  ⊂ orders_short_id_key    [único]
--   ps_user_idx            (   130 escaneos)  ⊂ push_subscriptions_user_id_endpoint_key
--
-- LEER ESOS NÚMEROS AL REVÉS ES EL ERROR FÁCIL. Los cuatro gemelos únicos
-- marcan CERO escaneos, y eso no significa que estén muertos: con dos btrees
-- equivalentes el planner elige uno y se queda con él. Al quitar el sobrante,
-- los escaneos pasan al que queda, con la misma estructura y el mismo coste. Un
-- índice único sirve para todo escaneo que sirva el no-único.
--
-- Los tres primeros son duplicados exactos (misma columna, mismo orden). El
-- cuarto es un prefijo: un btree sobre (user_id, endpoint) atiende igual las
-- búsquedas por `user_id` solo.
--
-- POR QUÉ SON SEGUROS, COMPROBADO ANTES DE ESCRIBIR ESTO
--   · Ninguno respalda una constraint (`pg_constraint.conindid`): las cuatro
--     UNIQUE las respaldan sus gemelos `_key`, que se quedan.
--   · Ninguno se nombra en el repo salvo en su `create index` de la 0002.
--   · Las tablas están en `REPLICA IDENTITY FULL`: ninguno hace de identidad de
--     réplica.
--
-- EL QUINTO ES OTRA COSA: `orders_risk_flags_gin_idx`
-- Un GIN sobre jsonb que NINGUNA consulta del repo puede aprovechar — no hay ni
-- un `@>`, `?`, `?|` ni `?&` sobre `risk_flags` en ningún sitio: se lee como
-- columna normal, y una lectura de columna jamás usa un GIN. No está sin usar
-- por tabla pequeña; está sin usar por imposible. Y un GIN paga mantenimiento en
-- cada escritura de `orders`.
--
-- LO QUE **NO** SE TOCA, aunque el advisor los marque
-- El advisor lista 10 índices "sin usar". Nueve se quedan. `orders` tiene 143
-- filas, 112 kB de datos y 352 kB de índices: a ese tamaño el planner hace seq
-- scan para casi todo, así que "nunca usado" significa "la tabla es pequeña", no
-- "el índice sobra". Dropearlos sería optimizar para hoy y pagarlo al crecer.
-- Los cinco de arriba son distintos: no los va a elegir nunca, tenga la tabla
-- 143 filas o 143.000.
--
-- Tampoco se añade ninguno de los 28 índices de FK que marca el advisor. Una FK
-- sin índice duele al borrar la fila PADRE, y en las 28 el padre es `users`,
-- `orders` o `reports` — ninguno se borra nunca en esta aplicación. Revisar el
-- día que exista "borrar mi cuenta".
--
-- NOTA SOBRE LAS MIGRACIONES DE ORIGEN. No se editan: ya están aplicadas en
-- todas partes y tocar una migración vieja rompe la reproducibilidad. En un
-- `db reset`, la 0002 crea los cuatro duplicados y la 0044 el GIN; esta los
-- borra después. Es feo y es correcto.
-- =============================================================================

-- ── 1. Los cuatro duplicados ─────────────────────────────────────────────────

drop index if exists public.drivers_user_id_idx;
drop index if exists public.businesses_user_id_idx;
drop index if exists public.orders_short_id_idx;
drop index if exists public.ps_user_idx;

-- ── 2. El GIN que ninguna consulta puede usar ────────────────────────────────

drop index if exists public.orders_risk_flags_gin_idx;

-- ── 3. La única policy del repo con auth.uid() sin envolver ──────────────────
--
-- `business_charges` viene de la 0073, escrita en otro estilo que el resto. Sin
-- el `(select ...)`, Postgres reevalúa `auth.uid()` UNA VEZ POR FILA en vez de
-- calcularlo como InitPlan; todas las policies de la 0004 ya usan esa forma. Es
-- el aviso `auth_rls_initplan` del advisor, y el único que quedaba.
--
-- La policy sigue siendo la misma —mismo nombre, mismas filas visibles—; cambia
-- solo cuántas veces se resuelve quién eres.

drop policy if exists "Business can view own charges" on public.business_charges;
create policy "Business can view own charges"
  on public.business_charges for select
  using (
    business_id in (
      select id from public.businesses
      where user_id = (select auth.uid())
    )
  );

-- ── Guards ───────────────────────────────────────────────────────────────────

do $$
declare
  v_sobran int;
  v_faltan int;
  v_qual text;
begin
  -- 4.1 · Los cinco se fueron.
  select count(*) into v_sobran
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'i'
     and c.relname in (
       'drivers_user_id_idx', 'businesses_user_id_idx', 'orders_short_id_idx',
       'ps_user_idx', 'orders_risk_flags_gin_idx'
     );

  if v_sobran > 0 then
    raise exception '0177 abortada: quedan % de los cinco índices', v_sobran using errcode = 'P0001';
  end if;

  -- 4.2 · Y los que hacen su trabajo SIGUEN ahí. Este guard es el que importa:
  -- dropear el gemelo solo es seguro porque el único se queda.
  select count(*) into v_faltan
    from (values
      ('drivers_user_id_key'), ('businesses_user_id_key'),
      ('orders_short_id_key'), ('push_subscriptions_user_id_endpoint_key')
    ) as esperado(nombre)
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'i' and c.relname = esperado.nombre
   );

  if v_faltan > 0 then
    raise exception '0177 abortada: faltan % índices únicos que deben cubrir a los borrados', v_faltan
      using errcode = 'P0001';
  end if;

  -- 4.3 · La policy quedó con el auth.uid() envuelto.
  select pg_get_expr(polqual, polrelid) into v_qual
    from pg_policy
   where polrelid = 'public.business_charges'::regclass
     and polname = 'Business can view own charges';

  if v_qual is null then
    raise exception '0177 abortada: la policy de business_charges no existe' using errcode = 'P0001';
  end if;
  -- Postgres lo reescribe como `( SELECT auth.uid() AS uid)`. Se busca solo el
  -- `SELECT auth.uid()`, sin paréntesis ni alias, para no atarse a cómo decida
  -- imprimirlo una versión futura; lo que distingue del caso malo es la
  -- presencia del SELECT, no el formato exacto.
  if v_qual not like '%SELECT auth.uid()%' then
    raise exception '0177 abortada: la policy de business_charges sigue con auth.uid() sin envolver: %', v_qual
      using errcode = 'P0001';
  end if;
end $$;
