-- ROLLBACK de 0167 — devuelve el search_path heredado a las funciones del slug.
--
-- Reabre el aviso `function_search_path_mutable` de get_advisors para las dos,
-- y con el la via por la que un esquema del llamante podria suplantar
-- `slugify(text)` durante el alta de un negocio. No revertir sin motivo.

alter function public.slugify(text) reset search_path;
alter function public.businesses_set_slug() reset search_path;
