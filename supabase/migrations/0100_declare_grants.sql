-- 0100_declare_grants.sql
--
-- QUÉ HACE
-- Declara explícitamente los privilegios del esquema `public` para los roles `anon`,
-- `authenticated` y `service_role` sobre los tres tipos de objeto —TABLAS, SECUENCIAS
-- y FUNCIONES— más los default privileges que gobiernan los objetos futuros de cada tipo.
--
-- CAPAS
--   1. Tablas existentes            2. Default privileges de tablas
--   3. Secuencias existentes        4. Funciones existentes (Grupo A)
--   5. Default privileges de secuencias y funciones
--
-- POR QUÉ (reproducibilidad, NO endurecimiento)
-- En producción esos privilegios existen desde siempre, pero NINGUNA migración los
-- declara: los otorga automáticamente el `pg_default_acl` que la plataforma Supabase
-- instala al provisionar el proyecto (`FOR ROLE postgres IN SCHEMA public`). Ese ACL
-- vive en el servidor, no en el repo. Consecuencia medida: una DB reconstruida solo
-- desde `supabase/migrations/` nace SIN esos grants (antes de esta migración,
-- `service_role` únicamente tenía privilegios sobre `outbox_events`, vía 0068), y por
-- tanto NO es equivalente a prod. Esta migración cierra ese hueco: mueve el estado
-- real de prod al repo para que cualquier reconstrucción nazca idéntica.
--
-- ES NO-OP EN PRODUCCIÓN
-- Cada GRANT de abajo re-declara un privilegio que prod ya tiene. GRANT es idempotente:
-- otorgar un privilegio existente no cambia el ACL. Verificado contra prod
-- (`zpnipajgwfthxhdtzhly`, PG 17.6) el 28/07/2026 con `aclexplode(relacl)`.
--
-- ALCANCE: SOLO REPRODUCIBILIDAD
-- Esta migración NO endurece ni recorta nada. En particular NO toca la superficie de
-- `anon`, que hoy en prod tiene los 8 privilegios sobre 38 tablas y queda igual. Revisar
-- si esa superficie debe reducirse es trabajo aparte (Council), no de este archivo.
-- Recordatorio: lo que realmente protege los datos es RLS, no la ausencia de GRANT.
-- Dos tablas de prod tienen RLS desactivada (`customer_otp_attempts`, `outbox_events`);
-- eso se reproduce tal cual aquí y también es materia del Council.
--
-- LOS 8 PRIVILEGIOS
-- El ACL de prod es `arwdDxtm` = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER, MAINTAIN. Son 8, no 7: `information_schema.role_table_grants` NO reporta
-- MAINTAIN (privilegio nuevo de PG17, fuera del estándar SQL), así que una foto tomada
-- solo con information_schema se queda corta. Se enumeran explícitamente en vez de usar
-- `GRANT ALL` para que quede auditable qué se otorga; en PG17 el conjunto enumerado
-- equivale exactamente a `ALL` sobre tablas: ni más, ni menos que prod.
--
-- EXCEPCIONES RESPETADAS (medidas en prod, ya declaradas en otras migraciones)
--   · `outbox_events`      -> SOLO `service_role`. `anon`/`authenticated` no tienen grant.
--                             Lo fija 0068_appeal_fallback_rpc.sql:25-26. Aquí NO se les
--                             otorga nada.
--   · `customer_profiles`  -> `authenticated` NO tiene UPDATE a nivel de tabla; tiene
--                             UPDATE column-level sobre 7 columnas. Lo fija
--                             0004_rls.sql:105-107. Aquí se le otorgan los otros 7
--                             privilegios y se omite UPDATE, para no pisar esa restricción.
--                             Los grants column-level viven en `pg_attribute.attacl` y no
--                             se ven afectados por un GRANT a nivel de tabla.

-- ---------------------------------------------------------------------------
-- CAPA 1 — Tablas EXISTENTES (39 tablas en `public`, todas relkind='r')
-- ---------------------------------------------------------------------------

-- 1.a) Las 37 tablas sin excepciones: los 8 privilegios a los tres roles.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table
    public.admin_alerts,
    public.app_settings,
    public.business_charges,
    public.business_schedule,
    public.businesses,
    public.cash_settlements,
    public.contingency_advances,
    public.customer_addresses,
    public.customer_incidents,
    public.customer_order_item_modifiers,
    public.customer_order_items,
    public.customer_otp_attempts,
    public.customer_strikes,
    public.domain_events,
    public.driver_availability,
    public.driver_restaurants,
    public.drivers,
    public.fraud_coverage_claims,
    public.idempotency_keys,
    public.menu_categories,
    public.menu_item_modifier_groups,
    public.menu_items,
    public.menu_modifier_groups,
    public.menu_modifier_options,
    public.order_assignment_rejections,
    public.order_event_log,
    public.order_status_history,
    public.order_transfer_requests,
    public.orders,
    public.push_delivery_log,
    public.push_subscriptions,
    public.reports,
    public.restaurant_payments,
    public.settlements,
    public.terms_acceptance,
    public.user_roles,
    public.users
  to anon, authenticated, service_role;

-- 1.b) EXCEPCIÓN `customer_profiles`: `authenticated` sin UPDATE de tabla (ver 0004).
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.customer_profiles
  to anon, service_role;

grant insert, select, delete, truncate, references, trigger, maintain
  on table public.customer_profiles
  to authenticated;

-- 1.c) EXCEPCIÓN `outbox_events`: solo `service_role` (ver 0068). Redundante con 0068
--      a propósito, para que esta migración sea la declaración completa del estado real.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.outbox_events
  to service_role;

-- ---------------------------------------------------------------------------
-- CAPA 2 — Tablas FUTURAS (replica el `pg_default_acl` de prod)
-- ---------------------------------------------------------------------------
-- Sin esto, la próxima tabla creada por una migración nacería con grants en prod
-- (por el default ACL de la plataforma) pero SIN ellos en local, reabriendo exactamente
-- el mismo desfase que esta migración corrige. `FOR ROLE postgres` es el que aplica:
-- las tablas de `public` son propiedad de `postgres` y las migraciones corren como
-- `postgres` (verificado: `relacl` de prod muestra `/postgres` como otorgante).
--
-- Prod tiene además una entrada equivalente `FOR ROLE supabase_admin`; esa la gestiona
-- la plataforma y queda fuera del alcance del repo deliberadamente.
--
-- ALTER DEFAULT PRIVILEGES ... GRANT es idempotente igual que GRANT.
alter default privileges for role postgres in schema public
  grant insert, select, update, delete, truncate, references, trigger, maintain
  on tables to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CAPA 3 — Secuencias EXISTENTES
-- ---------------------------------------------------------------------------
-- `public` tiene una sola secuencia. Medido (28/07/2026):
--   prod  -> anon/authenticated/service_role = SELECT, UPDATE, USAGE  (`rwU`)
--   local -> anon/authenticated/service_role = UPDATE                 (`w`)
-- El desfase no rompía `numero_pedido`: UPDATE por sí solo ya habilita `nextval()`.
-- Faltaban SELECT (currval/lastval) y USAGE. Se declara el estado de prod.
grant select, update, usage
  on sequence public.order_number_seq
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CAPA 4 — Funciones EXISTENTES (GRUPO A)
-- ---------------------------------------------------------------------------
-- Gap medido: 32 combos (función × rol) con EXECUTE en prod y ausentes en local.
-- Verificado previamente que las 32 funciones EXISTEN en local con firma idéntica.
--
-- ⚠️  GRUPO B — anon OMITIDO DELIBERADAMENTE, EN REVISIÓN DEL COUNCIL
--
-- CRITERIO (de seguridad, no de dominio). Va al Grupo B toda función que cumpla las tres:
--     (1) tiene EXECUTE para `anon` en prod,
--     (2) es SECURITY DEFINER  —es decir, corre con los privilegios del dueño y RLS
--         NO la contiene—, y
--     (3) muta estado (INSERT/UPDATE/DELETE) O retorna datos sensibles.
-- Ante la duda se omite: es más seguro dejar un grant fuera y revisarlo que declararlo
-- por error. Fidelidad a prod NO incluye replicar un posible bug de seguridad
-- (AGENTS.md §2.2 — dinero, gate humano).
--
-- De cada una se declaran solo sus grants legítimos (`authenticated`, `service_role`):
--   · register_appeal_refund(uuid, numeric, text, uuid)
--       SECDEF + INSERT/UPDATE + anon. RPC invocable (retorna jsonb). Appeals/refunds.
--   · generate_delivery_charges()
--       SECDEF + INSERT/UPDATE/DELETE + anon. Función de TRIGGER.
--   · handle_prepaid_cancel_auto_debt()
--       SECDEF + INSERT/UPDATE + anon. Función de TRIGGER.
--   · request_order_validation(uuid, uuid)
--       SECDEF + UPDATE sobre `orders` + anon. RPC invocable (retorna `orders`).
--   · get_tracking(text)
--       SECDEF + retorna DATOS SENSIBLES + anon: el jsonb incluye `proofUrl`
--       (comprobante de pago del cliente) y `driverName` (nombre real del motorizado),
--       además de ítems y montos.
--
-- PROCEDENCIA — por qué esto es un hallazgo y no una decisión de diseño:
-- Ninguna migración otorgó jamás `anon` a las primeras cuatro. `0085:413` da
-- `request_order_validation` a `service_role, authenticated`; `0067:481` da
-- `register_appeal_refund(uuid,text,numeric)` a `authenticated`. Sus grants a `anon` en
-- prod los produjo el default ACL de la plataforma al crear la función (ver CAPA 5b).
-- Es decir: son accidentales.
-- EXCEPCIÓN: `get_tracking` SÍ recibe `anon` de forma deliberada y repetida en 0003, 0061,
-- 0066, 0070, 0096 y 0099 (tracking público por `short_id`, feature de producto). Se omite
-- aquí por precaución del criterio, pero OJO: omitirlo NO revoca nada — el grant `anon`
-- sigue vigente vía esas migraciones. Solo deja de re-declararse en este archivo.
--
-- ALCANCE: esta migración solo AÑADE grants. No revoca. Aislar una función aquí evita
-- declarar el grant, no lo elimina donde ya exista.
--
-- ⚠️  FUERA DEL ALCANCE DE ESTE ARCHIVO (para el Council)
--   · cancel_expired_prepay_orders() — SECDEF + UPDATE sobre `orders` + anon: cumple el
--     criterio del Grupo B, pero su grant a `anon` lo otorga explícitamente
--     `0098_expose_expire_prepay_rpc.sql:70`, ya aplicada. Quitarlo exige un REVOKE, que es
--     endurecimiento y no reproducibilidad. Va en la migración separada del Council.

-- 4.a) Solo `service_role` (21 funciones).
grant execute on function
    public.apply_incident_strike(),
    public.apply_order_transfer(public.order_transfer_requests, public.transfer_request_status),
    public.create_contingency_advance(uuid, numeric, text, public.contingency_actor_charged, uuid, text),
    public.create_customer_incident(uuid, public.incident_type, uuid, text, text),
    public.create_fraud_claim(uuid, uuid, numeric, text, text),
    public.create_report_for_strike(),
    public.decrement_balance_on_payment(),
    public.dispatch_event(),
    public.dispute_contingency_advance(uuid, uuid, text),
    public.geo_distance_km(double precision, double precision, double precision, double precision),
    public.handle_orders_outbox_events(),
    public.log_order_status_change(),
    public.orders_before_write(),
    public.refresh_customer_profile_risk(uuid, text),
    public.refresh_customer_risk_from_strike(),
    public.resolve_contingency_advance(uuid, uuid, numeric, text),
    public.review_customer_incident(uuid, uuid, text),
    public.touch_updated_at(),
    public.update_assigned_at(),
    public.update_business_balance(),
    public.update_business_primary_capability()
  to service_role;

-- 4.b) `authenticated` + `service_role` (4 funciones).
grant execute on function
    public.create_appeal_report(uuid, uuid, text),
    public.mark_appeal_in_review(uuid),
    public.register_appeal_refund(uuid, text, numeric),
    public.resolve_appeal(uuid, text, text)
  to authenticated, service_role;

-- 4.c) `anon` + `authenticated` + `service_role` (2 funciones).
--      Únicos dos casos que pasan el criterio: no mutan estado ni exponen datos sensibles.
--      · derive_business_primary_capability -> NO es SECURITY DEFINER; función pura.
--      · is_published_business              -> SECDEF pero solo retorna un boolean de
--                                              publicación; helper usado por policies RLS.
grant execute on function
    public.derive_business_primary_capability(boolean, boolean, boolean, boolean),
    public.is_published_business(uuid)
  to anon, authenticated, service_role;

-- 4.d) GRUPO B — solo los grants legítimos. `anon` OMITIDO a propósito (ver bloque ⚠️).
grant execute on function
    public.register_appeal_refund(uuid, numeric, text, uuid),
    public.generate_delivery_charges(),
    public.handle_prepaid_cancel_auto_debt(),
    public.request_order_validation(uuid, uuid),
    public.get_tracking(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CAPA 5 — Default privileges de SECUENCIAS y FUNCIONES futuras
-- ---------------------------------------------------------------------------
-- Mismo razonamiento que la CAPA 2, aplicado a los otros dos tipos de objeto: sin esto,
-- la próxima secuencia o función creada por una migración nacería con grants en prod
-- (por el default ACL de la plataforma) pero sin ellos en local.

-- 5.a) Secuencias futuras: prod otorga `rwU` = SELECT, UPDATE, USAGE.
alter default privileges for role postgres in schema public
  grant select, update, usage
  on sequences to anon, authenticated, service_role;

-- 5.b) CAPA 5 — Default privileges de FUNCIONES (replica prod EXACTAMENTE, incluido anon).
-- ⚠️  anon recibe EXECUTE por default en prod HOY. Esto lo declara fielmente (no-op).
-- ⚠️  ESTO ESTÁ BAJO REVISIÓN DEL COUNCIL (seguridad: anon puede ejecutar funciones de
--     dinero SECURITY DEFINER sin auth, y RLS NO lo cubre). Si el Council decide endurecer,
--     el cambio va en una migración SEPARADA que ajuste este default y revoque los EXECUTE
--     existentes — NO editando esta línea. Esta capa solo fotografía el estado real de prod.
alter default privileges for role postgres in schema public
  grant execute
  on functions to anon, authenticated, service_role;
