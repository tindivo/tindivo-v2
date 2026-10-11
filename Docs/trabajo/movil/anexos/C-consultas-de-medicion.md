# Anexo C · Cómo se midió (para poder repetirlo)

> Todo lo `[DB-PROD]` del catálogo y de la auditoría sale de estas consultas, ejecutadas **en solo lectura**
> contra `tindivo-prod` (ref `zpnipajgwfthxhdtzhly`, migración 0230) por el MCP de Supabase el **2026-09-20**.
> Las mediciones `[PRUEBA]` son comandos que se ejecutaron desde el equipo de trabajo. Nada de esto escribe datos.

## 1. Consultas SQL (`tindivo-prod`)

**Inventario de tablas, RLS, tamaño, columnas, políticas, índices, triggers**
```sql
select c.relname as tbl, c.relrowsecurity as rls, c.reltuples::bigint as est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as size,
       (select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as cols,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as pol,
       (select count(*) from pg_index i where i.indrelid=c.oid) as idx,
       (select count(*) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as trg
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by pg_total_relation_size(c.oid) desc;
-- Confirmación: 45 tablas, 45 con RLS
select count(*), count(*) filter (where c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p');
```

**Funciones: tamaño, `SECURITY DEFINER`, `search_path`, `EXECUTE` para `anon`/`authenticated`**
```sql
select count(*) filter (where prokind='f') as functions,
       count(*) filter (where prosecdef) as secdef,
       count(*) filter (where prosecdef and array_to_string(coalesce(proconfig,'{}'),',') like '%search_path%') as secdef_pinned,
       count(*) filter (where has_function_privilege('anon', oid, 'EXECUTE')) as anon_exec,
       count(*) filter (where has_function_privilege('authenticated', oid, 'EXECUTE')) as auth_exec,
       sum(length(prosrc)) as source_bytes
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
select p.proname, length(p.prosrc) as src_len, p.prosecdef, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
order by length(p.prosrc) desc limit 20;
```

**Pedidos por canal, método de pago y cancelaciones (uso real)**
```sql
select source, delivery_method, payment_intent, count(*) n,
       count(*) filter (where customer_user_id is not null) with_account,
       count(*) filter (where status='delivered') delivered, count(*) filter (where status='cancelled') cancelled,
       min(created_at)::date, max(created_at)::date
from orders group by 1,2,3 order by n desc;
select source, cancel_reason, count(*) from orders where status='cancelled' group by 1,2 order by 1, 3 desc;
```

**Alcance de las notificaciones**
```sql
select coalesce(u.primary_role::text,'(sin usuario)') role, count(distinct ps.user_id) users_with_push, count(*) subs,
  count(*) filter (where ps.user_agent ilike '%iphone%' or ps.user_agent ilike '%ipad%') ios,
  count(*) filter (where ps.user_agent ilike '%android%') android
from push_subscriptions ps left join users u on u.id=ps.user_id group by 1;
select (select count(*) from push_subscriptions) total_subs,
       (select count(distinct user_id) from push_subscriptions) users_with_subs,
       (select count(*) from users where primary_role='customer') customer_users,
       (select count(distinct customer_user_id) from orders where source='customer_pwa') customers_who_ordered,
       (select count(distinct o.customer_user_id) from orders o where o.source='customer_pwa'
          and exists (select 1 from push_subscriptions ps where ps.user_id=o.customer_user_id)) ordered_and_have_push;
select event_type, status, error_code, count(*) from push_delivery_log group by 1,2,3 order by 4 desc;
select count(*) total, count(*) filter (where published_at is null) unpublished, count(*) filter (where retry_count>0) retried
from domain_events;
```

**Identidad**
```sql
select coalesce(raw_app_meta_data->>'provider','?') provider, count(*), count(*) filter (where phone is not null and phone<>'') with_phone
from auth.users group by 1;
select role::text, count(*) from user_roles group by 1;
```

**¿Operación real o pruebas? (supuesto 2 de `04-decisiones-abiertas.md`; solo agregados, sin datos personales)**
```sql
select count(*) total, min(created_at)::date first_day, max(created_at)::date last_day,
       count(distinct created_at::date) days_with_orders,
       count(*) filter (where created_at >= now() - interval '24 hours') last_24h,
       count(distinct customer_phone) distinct_phones,
       (select count(*) from (select customer_phone from orders group by 1 having count(*) = 1) s) phones_ordering_once,
       (select count(*) from (select customer_phone from orders group by 1 having count(*) >= 5) s) phones_ordering_5plus
from orders;
-- 716 · 2026-08-08 · 2026-09-20 · 43 días con pedidos (de 44) · 25 en 24 h · 386 teléfonos · 254 una vez · 12 con 5 o más
select 'cash_settlements' t, count(*) from cash_settlements
union all select 'restaurant_payments', count(*) from restaurant_payments
union all select 'business_charges', count(*) from business_charges;
-- 231 · 16 · 1 308
```

**Tamaño de la base y registro de `pg_cron` (`DAT-08`, `PRO-06`)**
```sql
select pg_size_pretty(pg_database_size(current_database())) db_size;          -- 148 MB
select n.nspname, pg_size_pretty(sum(pg_total_relation_size(c.oid))) size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','m') and n.nspname not in ('pg_catalog','information_schema')
group by 1 order by sum(pg_total_relation_size(c.oid)) desc;                  -- cron 117 MB · public 13 MB · auth 2,3 MB
select count(*) total_rows, min(start_time) oldest, max(start_time) newest,
       round(pg_total_relation_size('cron.job_run_details')::numeric / nullif(count(*),0)) bytes_per_row,
       round(count(*)::numeric / greatest(extract(epoch from (max(start_time) - min(start_time)))/86400, 1)) rows_per_day
from cron.job_run_details;                                                    -- 374 600 · 327 B · 6 463 por día
select j.jobname, j.schedule, count(d.*) runs
from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
group by 1, 2 order by 3 desc;                                               -- 4 barridos de 1 min: 83 458 · 83 458 · 58 306 · 58 182 ejecuciones
```

**Dispositivos de negocios y motorizados (`D-30`, supuesto 9 de `04-decisiones-abiertas.md`)**
```sql
select u.primary_role::text role,
       case when ps.user_agent ilike '%iphone%' or ps.user_agent ilike '%ipad%' then 'ios'
            when ps.user_agent ilike '%android%' then 'android'
            when ps.user_agent ilike '%windows%' then 'windows'
            when ps.user_agent ilike '%macintosh%' or ps.user_agent ilike '%mac os%' then 'mac'
            else 'otro' end platform, count(*) subs, count(distinct ps.user_id) users
from push_subscriptions ps left join users u on u.id = ps.user_id
where u.primary_role::text in ('business','driver') group by 1, 2 order by 1, 3 desc;
-- negocios: android 3/2 · windows 3/3 · mac 2/2 · ios 1/1   ·   motorizados: ios 4/3 · android 1/1   (suscripciones/usuarios)
```

**Región de la base y de la función (`PER-02`)**
```bash
cat supabase/.temp/pooler-url      # postgresql://postgres.<ref>@aws-1-us-west-2.pooler.supabase.com:5432/postgres  → base en us-west-2
curl -s -D - -o /dev/null https://apiv2.tindivo.com/api/v1/health | grep -i x-vercel-id   # gru1::iad1::…  → función en iad1
```

**Rendimiento de la base (`pg_stat_statements`, reinicio 2026-07-24)**
```sql
select (select stats_reset from pg_stat_statements_info) stats_reset,
       round(sum(total_exec_time)) total_ms,
       round(sum(total_exec_time) filter (where query like 'SELECT wal->>%')) realtime_wal_ms,
       round(sum(total_exec_time) filter (where query ~* '^select public\.[a-z_]+\(\)$')) cron_fn_ms,
       round(sum(total_exec_time) filter (where query like '%pgrst_source%')) postgrest_rpc_ms
from pg_stat_statements;
select left(regexp_replace(query,'\s+',' ','g'),140) q, calls, round(mean_exec_time::numeric,2) mean_ms, round(max_exec_time) max_ms
from pg_stat_statements where query not ilike '%pg_catalog%' order by total_exec_time desc limit 18;
```

**Otras**
```sql
select jobname, schedule, active, command from cron.job;                  -- 11 jobs
select tablename from pg_publication_tables where pubname='supabase_realtime';   -- 7 tablas
select id, public, file_size_limit, allowed_mime_types from storage.buckets;     -- 5 buckets
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='storage';
select key, left(value::text,400) from app_settings order by key;                -- 21 claves
select column_default from information_schema.columns
 where table_name='idempotency_keys' and column_name='expires_at';               -- now() + 24h
select typname, string_agg(enumlabel, ', ' order by enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid group by 1;
select pg_get_functiondef(p.oid) from pg_proc p where proname in
 ('get_tracking','dispatch_event','claim_outbox_events','register_appeal_refund','resolve_appeal','mark_appeal_in_review',
  'cancel_customer_order','customer_contraentrega_decision');                    -- definiciones leídas
select version();                                                                -- PostgreSQL 17.6
```

**Advisors (`get_advisors`, 2026-09-20):** *security* — 3 `rls_enabled_no_policy` (INFO, intencional), 8
`anon_security_definer_function_executable`, 23 `authenticated_security_definer_function_executable`,
1 `auth_leaked_password_protection`; *performance* — 30 `unindexed_foreign_keys`, 13 `unused_index`,
63 `multiple_permissive_policies`. Sin ERROR.

## 2. Mediciones de red (`[PRUEBA]`, desde el equipo de trabajo)

Solo `GET` a endpoints públicos, nueva conexión TLS en cada llamada (`curl -w`). Método:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -m 25 -o /dev/null -w "%{time_starttransfer} " "https://apiv2.tindivo.com/api/v1/health?y=$RANDOM$i"
done                                     # 0 rondas a la base  → ~0,46-0,47 s
# idem con /public/schedule?y=… y /public/search?q=pizza&y=…    # 1 ronda   → ~0,55-0,77 s
# idem con /public/businesses?x=… y /public/businesses/<slug>?x=…  # 2-3 rondas → ~0,83-1,19 s
curl -s -D - -o /dev/null https://apiv2.tindivo.com/api/v1/health | grep -i x-vercel-id   # gru1::iad1::…
```

- El parámetro aleatorio fuerza *cache miss* del borde. `x-vercel-id: gru1::iad1::…` = borde en São Paulo,
  función en Washington D. C.
- El gateway de Supabase respondió detrás de Cloudflare **Lima** (`cf-ray …-LIM`).
- **Una llamada sin efectos a la Edge Function `send-push`** (evento inexistente, `aggregate_id` nulo): con la
  *anon key* pública → **200** `{"ok":true,"recipients":0}`; sin cabecera → **401**. No se envió ninguna notificación.

## 3. Comprobaciones de código y de CI

```bash
pnpm lint                 # Biome: 0 errores, 13 avisos
pnpm check:ds             # FALLA también en HEAD limpio (exportado con `git archive`): «6 infracciones resueltas»
pnpm check:auth           # OK — 898 ficheros
pnpm check:dialogs        # OK — 389 ficheros
pnpm graphify:update      # 7 745 nodos, 15 623 aristas (AST local)
git grep -c "customer_pwa" …    # acoplamiento del canal
git grep -n "@upstash|Ratelimit" # importaciones reales: ninguna (solo package.json)
git log --since='30 days ago' --diff-filter=A --name-only -- supabase/migrations | grep -c '\.sql'   # 51
```

**No se ejecutaron** los tests de integración (escriben en la base y ensucian los fixtures) ni
`pnpm type-check` / `pnpm build` (pueden invalidar el servidor de desarrollo de otras sesiones).

## 4. Scripts de extracción (regenerables)

En `anexos/scripts/`: `api_surface.js` (lee cada `route.ts` y produce la superficie), `build_api_annex.js` (anexo A),
`build_matrix.js` (matriz de disposición) y `build_orders_annex.js` (anexo B). Tienen rutas absolutas de esta máquina al inicio
(`ROOT`, `DIR`, `SP`, `OUT`): hay que ajustarlas antes de correrlos en otro equipo.
