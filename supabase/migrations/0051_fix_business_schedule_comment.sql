-- =============================================================================
-- 0051 · Corrige el comentario STALE de business_schedule.day_of_week.
--
-- 0002 decía "0 = domingo", pero el único escritor real (el editor del panel
-- de negocios) usa 0=Lunes..6=Domingo, y el helper getOpenStatus de
-- @tindivo/contracts asume esa misma convención. Solo comentario; idempotente.
-- =============================================================================

comment on column public.business_schedule.day_of_week is
  '0=Lunes..6=Domingo (convención del editor del panel de negocios y de getOpenStatus en contracts).';
