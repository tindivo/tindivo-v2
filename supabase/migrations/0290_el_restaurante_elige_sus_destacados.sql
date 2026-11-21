-- ============================================================================
-- 0290 — el restaurante elige qué platos van en «Destacados» y cómo se llama la sección
-- ============================================================================
--
-- PROBLEMA. «Destacados» era `menu_items.is_compact` (nombre histórico, 0206): ordena un plato primero DENTRO de su
-- sección y le pone una insignia. La app del cliente (CUS-CAT-028, decisión de Jesús del 2026-11-19) quiere una
-- sección propia, de uno a seis platos de cualquier sección, con el nombre que ponga el restaurante.
--
-- QUÉ HACE (aditivo; ninguna fila existente cambia de comportamiento).
--   · `menu_items.is_featured boolean NOT NULL DEFAULT false`: el plato va en la sección «Destacados».
--   · `businesses.featured_title text NULL`: el nombre de la sección. NULL = «Destacados». De 1 a 30 caracteres.
--
-- NO CAMBIA `is_compact`: sigue ordenando dentro de su sección. No toca RLS ni permisos: las columnas nuevas caen bajo
-- las policies de la fila (`mi_owner_all` de la carta; el nombre lo escribe la API con `service_role`, como el resto
-- del perfil). No es dinero. El tope de seis platos lo aplica la API al servir la carta.
--
-- ORDEN DE DESPLIEGUE: esta migración va a producción ANTES de desplegar la API (la carta pública y el perfil leen y
-- escriben las columnas nuevas).
--
-- Idempotente. Rollback: supabase/rollbacks/0290_el_restaurante_elige_sus_destacados.rollback.sql
-- ============================================================================

alter table public.menu_items add column if not exists is_featured boolean not null default false;

alter table public.businesses add column if not exists featured_title text;

alter table public.businesses drop constraint if exists businesses_featured_title_check;
alter table public.businesses add constraint businesses_featured_title_check
  check (
    featured_title is null
    or (featured_title = btrim(featured_title) and char_length(featured_title) between 1 and 30)
  );

comment on column public.menu_items.is_featured is
  'true = el plato va en la sección «Destacados» de la carta (CUS-CAT-028). Distinto de is_compact, que solo ordena dentro de su sección. La API sirve hasta 6, disponibles y con foto.';
comment on column public.businesses.featured_title is
  'Nombre que el restaurante le pone a su sección de destacados. NULL = «Destacados».';
