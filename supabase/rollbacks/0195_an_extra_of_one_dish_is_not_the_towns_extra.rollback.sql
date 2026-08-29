-- Rollback para 0195_an_extra_of_one_dish_is_not_the_towns_extra.sql
--
-- Quita `is_library` y su índice. La columna es aditiva y nada más del esquema
-- depende de ella, así que no hay que restaurar ninguna función.
--
-- LO QUE SE PIERDE, Y NO VUELVE
--   El valor de `is_library` de cada grupo. Si alguien ya subió extras a la
--   biblioteca a mano, ese trabajo desaparece: al volver a aplicar la 0195 todo
--   entra otra vez como `false` salvo lo que tenga 2+ platos enlazados. Lo que
--   SÍ se reconstruye solo es lo compartido, porque el backfill lo deduce de la
--   tabla puente.
--
--   Antes de correr esto, si quieres poder rehacerlo:
--     select id, name from public.menu_modifier_groups where is_library;
--
-- CUIDADO: el codigo de `negocios` filtra el buscador de extras por esta
-- columna. Revertir la migración sin revertir el despliegue deja la consulta
-- pidiendo una columna que ya no existe, y el editor de platos falla al cargar.
-- Revierte el despliegue primero.
--
-- IDEMPOTENTE: `DROP ... IF EXISTS`.

DROP INDEX IF EXISTS public.idx_menu_modifier_groups_library;

ALTER TABLE public.menu_modifier_groups
  DROP COLUMN IF EXISTS is_library;
