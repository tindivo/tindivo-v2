-- =============================================================================
-- 0087 · Rescate de configuración real (public.app_settings)
-- =============================================================================
-- Rescata la configuración operativa real exportada de web-v2 (psjigdoinfpgrnedxeyf)
-- previo a la creación del proyecto Supabase definitivo.
-- Sobrescribe los placeholders de migraciones anteriores (0006, 0045, etc.)
-- usando ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value.
-- =============================================================================

INSERT INTO public.app_settings (key, value) VALUES
-- a) Cobertura geográfica real: 14 coordenadas del polígono de San Jacinto
('coverage_polygon', '{
  "polygon": [
    {"lat": -9.14722321379601,  "lng": -78.28638553619385},
    {"lat": -9.151036456896874, "lng": -78.28458309173585},
    {"lat": -9.155358082989405, "lng": -78.28458309173585},
    {"lat": -9.154764921733651, "lng": -78.27840328216554},
    {"lat": -9.152392266815049, "lng": -78.2774591445923},
    {"lat": -9.148833254757374, "lng": -78.27754497528078},
    {"lat": -9.149087471085256, "lng": -78.27462673187257},
    {"lat": -9.146884256875804, "lng": -78.27539920806886},
    {"lat": -9.14510472774794,  "lng": -78.27127933502199},
    {"lat": -9.144087849965702, "lng": -78.27359676361085},
    {"lat": -9.14137616167847,  "lng": -78.27282428741456},
    {"lat": -9.138325487670363, "lng": -78.27119350433351},
    {"lat": -9.136376432263054, "lng": -78.27720165252687},
    {"lat": -9.140634680816666, "lng": -78.28572034835817}
  ]
}'::jsonb),

-- b) Horario de plataforma: 7 días operativos (lunes a domingo)
('platform_schedule', '{
  "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  "startHHMM": "18:00",
  "endHHMM": "23:00"
}'::jsonb),

-- c) Umbral de prepago obligatorio: S/ 80
('prepay_threshold', '80'::jsonb),

-- d) Cobertura circular: centroide real de San Jacinto (-9.1465, -78.2779)
('coverage', '{
  "centerLat": -9.1465,
  "centerLng": -78.2779,
  "radiusKm": 3
}'::jsonb),

-- e) Validación de ubicación: mismo centroide real
('location_validation', '{
  "centerLat": -9.1465,
  "centerLng": -78.2779,
  "timeoutMs": 15000,
  "maxAccuracyM": 500,
  "normalRadiusKm": 10,
  "warningRadiusKm": 30
}'::jsonb),

-- f) Configuración del outbox push dispatcher (se actualizará con el ref del nuevo proyecto)
('push_dispatch', '{
  "url": "https://<PROJECT_REF>.supabase.co/functions/v1/send-push",
  "anonKey": "<ANON_KEY_PLACEHOLDER>"
}'::jsonb)

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
