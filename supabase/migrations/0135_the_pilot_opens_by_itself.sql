-- =============================================================================
-- 0135 · El piloto se abre solo
-- =============================================================================
--
-- QUÉ HACE
-- Crea `pilot_whitelist`: la lista de celulares invitados al piloto cerrado que
-- corre desde hoy hasta el lanzamiento público del viernes 14 de agosto de 2026
-- a las 18:00 de Lima (`2026-08-14T23:00:00Z`).
--
-- CÓMO SE USA
-- Las filas se insertan A MANO desde el dashboard de Supabase. No hay CRUD en el
-- panel de admin, no hay endpoint de alta y no hay tabla de solicitudes: la
-- captación va por un Google Form externo. Son 30-50 números; construir pantallas
-- para eso costaría más que teclearlos.
--
-- LA REGLA NO VIVE AQUÍ
-- Esta tabla es solo el padrón. La regla —«¿el piloto sigue activo?»— vive en
-- `packages/contracts/src/pilot.ts` (`PILOT_LAUNCH_AT` + `isPilotActive()`), en una
-- sola definición que consumen `apps/api` y `apps/customer`. La fecha NO se guarda
-- en `app_settings` a propósito: es una constante de despliegue, no un parámetro
-- operativo, y no debe poder cambiarse por accidente desde el panel.
--
-- QUÉ PASA EL 14 A LAS 18:00
-- Nada, y eso es el punto. `isPilotActive()` empieza a devolver `false` por sí
-- solo y los dos gates del API dejan de consultar esta tabla. No hace falta
-- deploy, ni migración, ni que nadie apriete un botón. La tabla queda ahí,
-- inerte; borrarla es trabajo de limpieza posterior, no del lanzamiento.
--
-- FORMATO DEL TELÉFONO
-- 9 dígitos empezando en 9, que es exactamente la salida de `PhonePeSchema`
-- (`packages/contracts/src/primitives.ts:31`, `^9\d{8}$`). NO se guarda en E.164.
-- Ojo, porque el esquema es inconsistente y hay que saberlo al teclear filas:
--   · `customer_profiles.phone` y `customer_otp_attempts.phone` -> E.164 (`+51999888777`)
--   · `orders.customer_phone`                                   -> 9 dígitos (`999888777`)
-- Se elige 9 dígitos porque es la forma canónica del contrato; los dos puntos de
-- enforcement normalizan a ese formato antes de consultar (el gate de pedidos le
-- quita el `+51` al teléfono verificado). El CHECK impide que una fila tecleada a
-- mano en E.164 entre sin ruido y silenciosamente no matchee nunca.
--
-- RLS Y GRANTS
-- RLS activada, CERO policies: eso deniega todo a `anon` y `authenticated`.
-- `service_role` tiene `rolbypassrls = true`, así que el backend lee sin estorbo.
-- Es el mismo patrón que `idempotency_keys` y el que fijó la 0104 para
-- `customer_otp_attempts` y `outbox_events`.
--
-- ⚠️  EL REVOKE NO ES DECORATIVO. La 0100 (`declare_grants`, CAPA 2) dejó puesto un
-- `alter default privileges ... on tables to anon, authenticated, service_role`,
-- así que esta tabla NACE con los 8 privilegios para `anon` y `authenticated` sin
-- que nadie los pida. RLS ya la protegería, pero dejar el grant colgando contradice
-- el precedente de `outbox_events` (0068: solo `service_role`) y deja una superficie
-- que no hace falta. Se revoca explícitamente y se declara solo lo que se usa.
-- Sin ese REVOKE, la anon key del browser podría enumerar los 30-50 números
-- invitados si algún día alguien añadiera una policy permisiva por descuido.
--
-- ⚠️  NO ES NO-OP: crea una tabla nueva. Contiene datos personales (teléfonos) ->
-- gate humano antes del push (AGENTS.md §2.2).
-- Idempotente: `create table if not exists` + `enable row level security` (no-op si
-- ya está) + GRANT/REVOKE (idempotentes por definición).

create table if not exists public.pilot_whitelist (
  phone      text primary key check (phone ~ '^9\d{8}$'),
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

comment on table public.pilot_whitelist is
  'Padrón del piloto cerrado: celulares invitados a mano hasta PILOT_LAUNCH_AT (2026-08-14T23:00:00Z). Filas insertadas desde el dashboard. La regla de vigencia vive en packages/contracts/src/pilot.ts, no aquí.';
comment on column public.pilot_whitelist.phone is
  'Celular peruano en 9 dígitos (formato PhonePeSchema, ^9\d{8}$). NO E.164: no lleva +51.';
comment on column public.pilot_whitelist.active is
  'false revoca la invitación sin borrar la fila (deja rastro de a quién se invitó).';

alter table public.pilot_whitelist enable row level security;

-- Retira los grants que el default ACL de la 0100 acaba de otorgar al crear la tabla.
revoke all on table public.pilot_whitelist from anon, authenticated;

-- Solo el backend. Mismos 8 privilegios que el resto del esquema declara para service_role.
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.pilot_whitelist
  to service_role;
