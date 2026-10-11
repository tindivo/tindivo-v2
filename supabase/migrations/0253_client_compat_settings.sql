-- =============================================================================
-- 0253 · Compatibilidad de las apps nativas: versión mínima y sistema mínimo
-- =============================================================================
--
-- Siembra `app_settings.client_compat`, que lee `GET /api/v1/config` y el
-- proxy de la API para rechazar (426 `client_upgrade_required`) a una app
-- nativa por debajo del mínimo de SU app y SU plataforma.
--
-- Forma:
--   { "minAppVersion": { "<app>": { "ios": "x.y.z", "android": "x.y.z" } },
--     "minOs": { "android": 26, "ios": 17 } }
--
-- `0.0.0` = sin mínimo (nadie queda bloqueado hasta que se suba a mano).
-- `minOs` es la decisión D-47: Android 8 (API 26) e iOS 17.
--
-- NO se toca la policy `as_public_read`: la API lee la clave con service role,
-- así que no hace falta ampliar el whitelist público. Idempotente, y
-- `DO NOTHING` para no pisar mínimos que se hayan subido a mano.
-- =============================================================================

INSERT INTO public.app_settings (key, value)
VALUES (
  'client_compat',
  '{
    "minAppVersion": {
      "customer":    { "ios": "0.0.0", "android": "0.0.0" },
      "negocios":    { "ios": "0.0.0", "android": "0.0.0" },
      "motorizados": { "ios": "0.0.0", "android": "0.0.0" }
    },
    "minOs": { "android": 26, "ios": 17 }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
