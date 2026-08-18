-- =============================================================================
-- 0167 — las funciones del slug fijan su search_path
-- =============================================================================
--
-- `get_advisors` marca `slugify()` y `businesses_set_slug()` con
-- `function_search_path_mutable`: son las dos funciones que introdujo `0165` y
-- son las dos unicas del lote que salieron sin `search_path` fijado. El
-- invariante 3 de CLAUDE.md lo pide explicitamente.
--
-- Por que importa aqui, y no es solo higiene del linter: `businesses_set_slug`
-- corre como TRIGGER en cada alta de negocio. Con el search_path heredado de
-- quien inserta, un esquema controlable por el llamante que declare su propio
-- `slugify(text)` se resolveria ANTES que el de `public`, y el slug — que es
-- una clave de acceso publico y unica — lo elegiria codigo ajeno.
--
-- Se puede fijar a '' sin tocar los cuerpos: `slugify` solo usa builtins
-- (`lower`, `coalesce`, `translate`, `regexp_replace`, `trim`), que viven en
-- `pg_catalog` y siguen visibles con el search_path vacio; y
-- `businesses_set_slug` ya cualifica `public.slugify` y `public.businesses`.
--
-- `alter function` cambia solo la configuracion: no reescribe el cuerpo ni
-- recrea el trigger, asi que no hay ventana en la que las altas queden sin el.

alter function public.slugify(text) set search_path = '';
alter function public.businesses_set_slug() set search_path = '';
