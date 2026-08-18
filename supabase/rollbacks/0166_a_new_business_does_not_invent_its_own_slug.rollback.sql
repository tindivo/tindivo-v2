-- ROLLBACK de 0166 — vuelve a dejar businesses.slug sin default.
--
-- Ojo: con esto el tipo `Insert` generado por `pnpm db:types` vuelve a exigir
-- `slug`, y el alta de negocios del admin deja de compilar. No revertir sin
-- devolver también ese sitio de llamada a pasar un slug explícito.

alter table public.businesses alter column slug drop default;

comment on column public.businesses.slug is
  'Identificador legible en la URL pública (/negocio/<slug>). NO sigue al nombre: ver 0165.';
