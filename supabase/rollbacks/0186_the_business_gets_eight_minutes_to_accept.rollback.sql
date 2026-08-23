-- ROLLBACK de 0186 — la ventana de aceptación vuelve a 5 minutos.
--
-- Seguro en cualquier momento: no hay estructura que revertir, solo un número.
-- Los pedidos que ya estén en `pending_acceptance` con entre 5 y 8 minutos de
-- antigüedad se cancelarán en el siguiente barrido (dentro del minuto), que es
-- exactamente lo que este rollback pide.
--
-- Si se revierte, revierte también los fallbacks del front que la 0186 dejó en 8
-- (`apps/api/lib/inngest/functions.ts`, `apps/customer/features/tracking/lib/deadline.ts`,
-- `apps/negocios/lib/orders/view-model.ts`) y la fila de `DECISIONS.md §10`.

UPDATE public.app_settings
SET value = jsonb_set(value, '{acceptanceMinutes}', '5'::jsonb, true)
WHERE key = 'timers';
