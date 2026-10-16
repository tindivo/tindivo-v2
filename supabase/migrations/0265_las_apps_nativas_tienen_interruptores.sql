-- =============================================================================
-- 0265 · Las apps nativas tienen interruptores (kill switches)
-- =============================================================================
--
-- Siembra `app_settings.client_features`, que lee `GET /api/v1/config` (estándar
-- CLI-4 y OPS-6). Forma:
--   { "features": { "<clave>": { "enabled": true|false, "message": "texto" } } }
--
-- Nace VACÍA: una función nueva y arriesgada de las apps nativas se declara aquí
-- con una migración (la clave la crea un desarrollador). El admin solo cambia
-- `enabled` y `message` de las claves que ya existen (Admin -> Apps).
-- `enabled: false` apaga la función; una clave ausente = la app usa su valor por
-- defecto compilado.
--
-- NO se toca la policy `as_public_read` ni los grants: la API lee la clave con
-- service role, igual que con `client_compat` (0253). Idempotente, y DO NOTHING
-- para no pisar interruptores que ya se hayan tocado.
-- =============================================================================

INSERT INTO public.app_settings (key, value)
VALUES ('client_features', '{"features":{}}'::jsonb)
ON CONFLICT (key) DO NOTHING;
