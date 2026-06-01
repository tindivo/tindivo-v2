-- =============================================================================
-- 0006 · Seed de configuración global (app_settings)
-- Valores del Documento Maestro / FASE-1. Idempotente (ON CONFLICT DO NOTHING:
-- no pisa cambios que el admin haya hecho luego).
-- Las cuentas (admin/negocio/motorizado) se crean vía Supabase Auth en Fase 3.
-- =============================================================================

insert into public.app_settings (key, value) values
  -- Comisión total a Tindivo por banda (2 bandas — Documento Maestro)
  ('commissions', '{"pickup": 0.50, "near": 3.00, "far": 3.50}'::jsonb),
  -- Delivery que paga el cliente por banda
  ('delivery_bands', '{"near": 2.00, "far": 2.50}'::jsonb),
  -- Umbral de prepago obligatorio (>= S/100)
  ('prepay_threshold', '100'::jsonb),
  -- Cobertura: radio configurable, centro San Jacinto
  ('coverage', '{"centerLat": -9.1547, "centerLng": -78.5042, "radiusKm": 3}'::jsonb),
  -- Horario de plataforma (La Florencia opera de noche, mar-sáb ~18:00-23:00)
  ('platform_schedule', '{"days": ["tue", "wed", "thu", "fri", "sat"], "startHHMM": "18:00", "endHHMM": "23:00"}'::jsonb),
  -- Reglas de asignación (modeladas; asignación automática fuera de Fase 1)
  ('assignment_rules', '{"maxOrdersPerDriver": 3, "maxRestaurantsPerDriver": 2, "maxOccupancySlotsPerOrder": 3, "groupingWindowMinutes": 5, "urgentAfterMinutes": 5, "extremeAlertAfterMinutes": 8}'::jsonb),
  -- Fondo de contingencia (S/200-300)
  ('contingency_fund', '{"initial": 250, "current": 250}'::jsonb),
  -- Tiempos (min) — tuneables sin migración
  ('timers', '{"acceptanceMinutes": 5, "prepayVerificationMinutes": 10, "validationMinutes": 5, "prepExtensionMinutes": 10, "maxPrepExtensions": 2, "noShowWaitMinutes": 5, "cashAutoConfirmHours": 24}'::jsonb),
  -- Soporte
  ('support_phone', '"+51987654321"'::jsonb),
  ('support_whatsapp', '"+51987654321"'::jsonb),
  -- Versión vigente de términos
  ('terms_version', '"2026-05"'::jsonb)
on conflict (key) do nothing;
