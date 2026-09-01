-- =============================================================================
-- 0201 · Tres tablas niegan todo A PROPÓSITO, y ahora lo dicen
-- =============================================================================
--
-- `customer_otp_attempts`, `idempotency_keys` y `outbox_events` tienen RLS
-- ACTIVADA y **cero policies**. Medido:
--
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
--     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
--   -- customer_otp_attempts
--   -- idempotency_keys
--   -- outbox_events
--
-- Funcionalmente eso es lo correcto: RLS sin policy niega TODO a `anon` y a
-- `authenticated`, y `service_role` la salta. Las tres se tocan únicamente
-- desde `apps/api` con `createServiceClient()`:
--
--   customer_otp_attempts · app/api/v1/customer/phone/send-code/route.ts
--   idempotency_keys      · lib/http/idempotency.ts
--   outbox_events         · lib/outbox/processor.ts
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ENTONCES ¿QUÉ ARREGLA ESTA MIGRACIÓN?
--
--   La legibilidad, que aquí no es cosmética. `CLAUDE.md` pide **«RLS activada
--   en TODAS las tablas con policies explícitas»**, y desde fuera una tabla con
--   RLS y sin policy es INDISTINGUIBLE de una a la que se le olvidó escribirlas.
--   Las dos se ven igual en `pg_policy`: vacías. La diferencia —una niega
--   porque se decidió, la otra porque nadie llegó— solo existe en la cabeza de
--   quien lo hizo.
--
--   Quien audite esto dentro de seis meses tiene dos salidas malas: darlas por
--   buenas sin mirar, o abrirles policies «que faltaban» y convertir en pública
--   una tabla de intentos de OTP.
--
--   NO se añaden policies de negación. Una policy `USING (false)` no cambia
--   nada del comportamiento —ya se niega todo— y añade una línea que el
--   siguiente lector tiene que interpretar. El comentario dice lo mismo sin
--   fingir que hay una regla.
--
-- =============================================================================


COMMENT ON TABLE public.customer_otp_attempts IS
  'Intentos de envío de OTP por teléfono, para el rate limit. RLS ACTIVADA y SIN '
  'POLICIES a propósito: niega todo a anon/authenticated y solo la toca el API '
  'con service_role (app/api/v1/customer/phone/send-code). No añadir policies: '
  'contiene teléfonos y cadencia de intentos, que es material de antifraude.';

COMMENT ON TABLE public.idempotency_keys IS
  'Idempotencia estilo Stripe para POSTs de creación (TTL 24h). RLS ACTIVADA y '
  'SIN POLICIES a propósito: solo la toca el API con service_role '
  '(lib/http/idempotency.ts). No añadir policies: guarda cuerpos de respuesta '
  'ya emitidos, y leerla desde el navegador sería leer pedidos de otros.';

COMMENT ON TABLE public.outbox_events IS
  'Outbox de la 0068 para los eventos de apelaciones. RLS ACTIVADA y SIN '
  'POLICIES a propósito: solo la toca el procesador del API con service_role '
  '(lib/outbox/processor.ts). Ojo: NO es el outbox principal — el del invariante '
  '4 es `domain_events`, escrito en la misma transacción que el agregado.';
