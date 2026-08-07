-- =============================================================================
-- 0113 · Actualización de número de soporte real, acceptanceMinutes y eliminación de support_phone
-- =============================================================================

-- 1. Fijar número real de soporte WhatsApp
UPDATE public.app_settings
SET value = '"51906550166"'::jsonb
WHERE key = 'support_whatsapp';

-- 2. Actualizar acceptanceMinutes de 5 a 15 minutos en app_settings.timers
UPDATE public.app_settings
SET value = jsonb_set(value, '{acceptanceMinutes}', '15'::jsonb)
WHERE key = 'timers';

-- 3. Eliminar support_phone obsoleta (se usa únicamente support_whatsapp)
DELETE FROM public.app_settings
WHERE key = 'support_phone';
