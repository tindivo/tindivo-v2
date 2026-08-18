-- =============================================================================
-- 0166 — un negocio nuevo no tiene que inventarse el slug
-- =============================================================================
--
-- `0165` dejó `businesses.slug` como `not null` SIN default. El trigger
-- `businesses_slug_guard` lo deriva del nombre en el alta, así que en tiempo de
-- ejecución un `insert` sin slug funciona: el BEFORE INSERT rellena la columna
-- antes de que se compruebe el NOT NULL.
--
-- Pero el generador de tipos no ve triggers, solo el esquema. Sin default,
-- `slug` sale como propiedad OBLIGATORIA en el tipo `Insert` de la tabla, y el
-- alta de negocios del admin (`POST /api/v1/admin/businesses`) dejó de
-- compilar — pidiendo que la capa de aplicación invente un dato que la base ya
-- sabe derivar, que es exactamente lo contrario de lo que `0165` quería.
--
-- El default vacío es la forma de decirlo en el esquema. No es un valor que
-- llegue a existir: `businesses_set_slug()` trata `''` igual que `null`
-- (`slugify('') = ''` → deriva del nombre), que es el camino que la cabecera de
-- `0165` ya describía como "si viene vacío se deriva del nombre". Ninguna fila
-- puede quedarse con `''`, así que el índice único no corre riesgo.
--
-- Solo cambia metadatos de la columna: sin reescritura de tabla, sin bloqueo.

alter table public.businesses alter column slug set default '';

comment on column public.businesses.slug is
  'Identificador legible en la URL pública (/negocio/<slug>). NO sigue al nombre: ver 0165. '
  'El default vacío significa "derívalo del nombre"; lo resuelve businesses_slug_guard (0166).';
