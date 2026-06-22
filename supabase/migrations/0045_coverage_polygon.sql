-- 0045_coverage_polygon.sql
-- Zona de cobertura como POLÍGONO (reemplaza visualmente al círculo de radio en el
-- selector de dirección del cliente). El polígono se dibuja en el mapa y restringe
-- dónde se puede colocar el pin (point-in-polygon en el cliente, con el radio de
-- app_settings.coverage como fallback). El admin lo edita con Leaflet-draw vía
-- PATCH /api/v1/admin/settings (key = coverage_polygon).
-- Idempotente y re-ejecutable (DECISIONS.md invariante #6).

-- 1) Polígono aproximado de San Jacinto, Áncash (anillo {lat,lng}; NO se cierra: el
--    último punto no repite el primero). Es un punto de partida: el admin lo afina
--    a la realidad del pueblo con el editor de Leaflet-draw.
insert into public.app_settings (key, value)
values (
  'coverage_polygon',
  '{"polygon":[
    {"lat":-9.1380,"lng":-78.5040},
    {"lat":-9.1430,"lng":-78.4880},
    {"lat":-9.1560,"lng":-78.4850},
    {"lat":-9.1700,"lng":-78.4900},
    {"lat":-9.1720,"lng":-78.5050},
    {"lat":-9.1670,"lng":-78.5210},
    {"lat":-9.1530,"lng":-78.5240},
    {"lat":-9.1410,"lng":-78.5190}
  ]}'::jsonb
)
on conflict (key) do nothing;

-- 2) Hacer 'coverage_polygon' legible por el cliente (anon/authenticated). Recreamos
--    as_public_read agregando la nueva key a la whitelist existente (idempotente).
drop policy if exists as_public_read on public.app_settings;
create policy as_public_read on public.app_settings for select to anon, authenticated
  using (key in (
    'platform_schedule',
    'support_phone',
    'support_whatsapp',
    'prepay_threshold',
    'delivery_bands',
    'coverage',
    'coverage_polygon',
    'location_validation',
    'terms_version'
  ));
