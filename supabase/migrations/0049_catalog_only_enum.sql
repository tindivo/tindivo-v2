-- =============================================================================
-- 0049 · Enum: nuevo valor 'catalog_only' para business_primary_capability.
--
-- Negocio que publica catálogo pero NO acepta pedidos web (ni pickup ni
-- delivery): los clientes piden por WhatsApp/llamada directa al negocio.
--
-- AISLADO en su propia migración: en Postgres un valor nuevo de enum no puede
-- usarse en la misma transacción que lo crea (PG 17). La función de derivación
-- que lo referencia va en 0050. Idempotente.
-- =============================================================================

alter type public.business_primary_capability add value if not exists 'catalog_only';
