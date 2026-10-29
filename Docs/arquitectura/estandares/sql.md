# Estándares · SQL y base de datos

> Verificado: 2026-10-12 · entorno: `develop@591ec569` · Parte de `Docs/arquitectura/estandares/` (niveles y excepciones: `README.md`)

Aplica a `supabase/`: migraciones, funciones, triggers, políticas y pruebas. Las migraciones como proceso (MIG) están en `README.md`.

## Reglas

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| DB-1 | **Nombres** en inglés y `snake_case`; tablas en plural; claves foráneas `<entidad>_id`; marcas de tiempo `<evento>_at`; booleanos `is_` o `has_`; enums y estados en inglés y `snake_case` | OBLIGATORIA para objetos nuevos | Consulta de catálogo |
| DB-2 | **RLS activada en toda tabla**; si es solo de servidor, se declara con `COMMENT ON TABLE … IS 'server-only'` | OBLIGATORIA | Consulta de catálogo |
| DB-3 | **`SECURITY DEFINER` solo si hace falta**, con `SET search_path = ''`, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` y `GRANT` explícito. Se comprueban los permisos efectivos (`proacl`), no solo el `REVOKE`. Los procesos internos (cron, consumidores) nunca son ejecutables por `anon` | OBLIGATORIA | Consulta de catálogo + advisor |
| DB-4 | **Funciones llamadas por la API**: reciben el actor explícito (`p_actor_user_id`, el nombre que ya usan las funciones del repo) y verifican rol y propiedad dentro. **Una función que recibe el actor solo la ejecuta el rol de servidor**: si `authenticated` pudiera llamarla, cualquiera suplantaría al actor llamando a PostgREST directamente. `auth.uid()` solo en políticas RLS | OBLIGATORIA para funciones nuevas | Prueba (pgTAP o integración): actor ajeno → error; consulta de permisos efectivos |
| DB-5 | **Máquinas de estado protegidas en la base**: tabla de transiciones permitidas + trigger que rechaza las demás, empezando por `orders` | OBLIGATORIA para máquinas nuevas | Prueba (pgTAP o integración) |
| DB-6 | Toda función nueva o modificada trae una **prueba pgTAP o de integración** que la ejercite directamente; una función por acción de negocio. Hoy la práctica del repo son las pruebas de integración de `apps/api` (no existe `supabase/tests`); adoptar pgTAP, su carpeta y `supabase test db` queda pendiente | OBLIGATORIA para funciones nuevas o modificadas | CI: job `api-integration` (pgTAP, pendiente) |
| DB-7 | **Dinero `numeric(10,2)`**; coordenadas `numeric(10,7)`; nunca `real`, `double precision` ni `float` para dinero (sin verificar que sea el estado actual en todas las tablas: lo que no cumpla va a `excepciones.md`) | OBLIGATORIA | Consulta de catálogo |
| DB-8 | `created_at timestamptz not null default now()` en toda tabla; `updated_at` con trigger en las que se actualizan; las bitácoras no admiten `UPDATE` y solo se borran por purga de retención (OPS-2) | OBLIGATORIA para tablas nuevas | Consulta de catálogo |
| DB-9 | **Índices por consulta real**: claves foráneas sin índice e índices sin uso son alerta y se decide caso a caso | ALERTA | Advisor |
| DB-10 | Varias políticas permisivas en la misma tabla y acción: alerta; se funden cuando el rendimiento lo pida | ALERTA | Advisor |
| DB-11 | `app_settings` guarda parámetros; lo que tiene ciclo de vida, historial o varias instancias (campañas, bloques de inicio) es una tabla | GUÍA | Revisión |
| DB-12 | Tabla de más de ~40 columnas: revisar si mezcla temas antes de añadir otra | ALERTA | Consulta de catálogo |
| DB-13 | **Borrar una cuenta anonimiza** sus datos personales (nombre, direcciones, tokens de dispositivo, y el teléfono salvo donde D-44 lo conserva: directorio y antifraude) y revoca sus sesiones; no borra en cascada pedidos ni registros financieros. Qué se conserva lo decidió D-44: pedidos anonimizados para siempre, comprobantes 90 días, directorio y antifraude por teléfono conservados | OBLIGATORIA | Prueba (pgTAP o integración): borrar un cliente con pedidos no rompe los cargos ni deja datos personales fuera de lo que D-44 conserva |
| DB-14 | **Los consentimientos son eventos de solo inserción** (`consent_events`: usuario, tipo, otorgado o revocado, versión del texto, plataforma, fecha); el estado vigente se lee con una función (`current_consent`) | OBLIGATORIA | Prueba (pgTAP o integración) |
| DB-15 | **Fechas siempre `timestamptz`**; nunca `timestamp` sin zona. La *fecha operativa* (el día de pedidos o de liquidación) se calcula en hora de Lima, `(now() at time zone 'America/Lima')::date`, nunca con `current_date` (`AGENTS.md`, invariante 10); para mostrar, la conversión a `America/Lima` va en vistas de reporte | OBLIGATORIA para objetos nuevos | Consulta de catálogo |
| DB-16 | **Funciones**: verbo + sustantivo (`advance_order`, `record_consent`); parámetros `p_*`, variables `v_*`; con `search_path = ''`, todo objeto propio va calificado (`public.orders`), las funciones de `pg_catalog` no lo necesitan; los errores de negocio, con `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<code>'`, donde `<code>` es un código estable en `snake_case` (`order_not_found`, `install_id_taken`) que la API traduce a un `code` de `packages/contracts/src/errors.ts`; el código es contrato interno entre la función y la API, y no se renombra sin cambiar las dos (Jesús, 2026-10-29, opción A). Hoy `throwRpcError` clasifica los `P0001` por el texto del mensaje (contrato H-8): leer ese `code` es trabajo pendiente | OBLIGATORIA para funciones nuevas | Revisión + prueba (pgTAP o integración) |
| DB-17 | Un **esquema de Postgres por módulo** cuando se cree un módulo nuevo; lo existente sigue en `public` | GUÍA | Revisión |
| DB-18 | Ninguna función, trigger, vista ni política de un módulo lee o escribe tablas de otro módulo sin pasar por su función pública; las excepciones, en `excepciones.md` | OBLIGATORIA para objetos nuevos | Revisión: Postgres no registra las dependencias dentro de cuerpos PL/pgSQL |
| DB-19 | **Columnas `jsonb`** solo para datos sin consultas por campo, o con esquema en `packages/contracts` validado al escribir; nunca para lo que se filtra o se suma | GUÍA | Revisión |

## Plantilla de función (DB-3, DB-4, DB-16)

Ilustrativa: el nombre de la tabla y los valores permitidos son los del modelo real.

```sql
create or replace function public.record_consent(
  p_actor_user_id uuid,
  p_kind         text,
  p_granted      boolean,
  p_text_version text,
  p_platform     text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind not in ('transactional', 'promotional') then
    raise exception using errcode = 'P0001', message = 'invalid_consent_kind';
  end if;

  insert into public.consent_events (user_id, kind, is_granted, text_version, platform)
  values (p_actor_user_id, p_kind, p_granted, p_text_version, p_platform);
end;
$$;

-- Recibe p_actor_user_id: solo la ejecuta el rol de servidor (DB-4).
revoke execute on function public.record_consent(uuid, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.record_consent(uuid, text, boolean, text, text)
  to service_role;
```

## Plantilla de prueba pgTAP (DB-6)

Ilustrativa: el repo aún no usa pgTAP ni tiene `supabase/tests/`; mientras tanto, la prueba es de integración en `apps/api`.

```sql
-- supabase/tests/consents/record_consent.test.sql
begin;
select plan(2);

select throws_ok(
  $$ select public.record_consent(gen_random_uuid(), 'marketing', true, 'promo-v1', 'ios') $$,
  'P0001',
  'invalid_consent_kind',
  'rechaza un tipo de consentimiento desconocido'
);

select is(
  has_function_privilege('authenticated', 'public.record_consent(uuid, text, boolean, text, text)', 'execute'),
  false,
  'authenticated no puede ejecutarla'
);

select * from finish();
rollback;
```

## Consultas de catálogo útiles

Tablas sin RLS (DB-2):

```sql
select n.nspname as schema, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
  and not c.relrowsecurity;
```

Columnas de dinero o de fecha con tipos prohibidos (DB-7, DB-15):

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    data_type in ('real', 'double precision')
    or data_type = 'timestamp without time zone'
  );
```

Funciones `SECURITY DEFINER` ejecutables por `anon` o `authenticated` (DB-3, DB-4):

```sql
select p.oid::regprocedure as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
```
