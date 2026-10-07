-- =============================================================================
-- 0247 · Las boticas y los comercios pasan a su categoría
-- =============================================================================
--
-- Reclasifica los lugares de `tindivo-prod` que estaban en la categoría
-- equivocada, con las categorías que crea la 0246.
--
-- POR `id`, Y SOLO SI SIGUEN EN LA CATEGORÍA VIEJA. Los `id` son los de
-- producción (los mismos que siembra `pnpm db:seed:lugares` en local). La
-- condición sobre la categoría vieja hace que la migración sea idempotente y,
-- sobre todo, que NO pise un cambio que Jesús haya hecho a mano desde el panel
-- (`/mapa-referencias`) entre que esto se escribió y se aplicó. En una base
-- sin estas filas (un `db reset` sin seed) no toca nada.
--
-- QUEDA SIN TOCAR, a propósito: «Sport San Jacinto» (en `otro`). No está claro
-- si es una tienda de deportes o un local deportivo; lo decide Jesús.
-- =============================================================================

-- Boticas: `salud` -> `farmacia`. Essalud y la Posta se quedan en `salud`.
UPDATE public.map_landmarks SET category = 'farmacia'
WHERE category = 'salud'
  AND id IN (
    '5fe8f185-2474-4e8a-b0c1-aff4ad9c1aa4', -- Botica la Merced
    'af382a33-4235-47b3-bfd4-a29ecd18fe04'  -- Inkafarma
  );

-- Negocios que estaban en la bolsa: `otro` -> `comercio`.
UPDATE public.map_landmarks SET category = 'comercio'
WHERE category = 'otro'
  AND id IN (
    'af81b0ad-f106-44d0-9711-1e98ed3d485f', -- Bar Los Ficus
    '1e3806aa-8b8f-4a29-a647-8c2e00ab40f2', -- Divina Spa
    '616f281f-93e2-43ab-92a4-12af6b775224', -- Estación de Servicios «Grupo HSJ»
    '1000c867-05a6-41c7-b0cb-045b89bfdcac', -- Grifo Primax
    'c7107028-5a76-426a-ad11-c4881c4b50ae', -- Librería Leni
    '839ccf82-de28-4719-8505-23a6b199ffdd'  -- Pastelería Arlita
  );

-- Una losa deportiva que había caído en `otro`.
UPDATE public.map_landmarks SET category = 'deporte'
WHERE category = 'otro'
  AND id = 'cd81cda7-248c-49b6-b63d-23fc4776141b'; -- Losa de San Pedro
