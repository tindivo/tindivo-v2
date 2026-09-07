-- ============================================================================
-- 0218 — Los nombres de las etiquetas no son un secreto
-- ============================================================================
--
-- QUÉ FALTABA. El panel del negocio cuenta las etiquetas de sus reseñas, pero
-- en `order_reviews.tags` solo hay ids (`demoro`, `llego_fria`). Los nombres
-- viven en `app_settings.reviews`, y esa tabla es legible únicamente para una
-- LISTA BLANCA de claves — `reviews` no estaba en ella.
--
-- POR QUÉ LA LISTA BLANCA Y NO UNA RPC NUEVA. Porque el mecanismo ya existe y
-- ya lo usan `max_change`, `timers` y `delivery_bands` desde estas mismas apps.
-- Una función `get_review_tags()` sería otra ACL que revocar y conceder, y otro
-- sitio donde mirar, para entregar cinco palabras.
--
-- QUÉ SE EXPONE, EXACTAMENTE. La clave `reviews` contiene `windowDays`,
-- `commentMaxLength` y el catálogo de etiquetas: parámetros y copy. Ninguna
-- reseña, ningún dato de nadie. `anon` la ve como ve el horario de la
-- plataforma o las bandas de reparto, y la 0216 ya le entrega el mismo catálogo
-- a cualquier cliente con sesión.
--
-- Idempotente.
-- ============================================================================

drop policy if exists as_public_read on public.app_settings;
create policy as_public_read on public.app_settings for select to anon, authenticated
  using (
    key = any (array[
      'platform_schedule',
      'support_phone',
      'support_whatsapp',
      'prepay_threshold',
      'delivery_bands',
      'coverage',
      'coverage_polygon',
      'location_validation',
      'terms_version',
      'max_cash_bill',
      'max_change',
      'timers',
      'reviews'
    ])
  );

-- Verificación: si la clave no quedó legible, la migración no ha hecho su
-- trabajo y es mejor enterarse aquí que en un panel que cuenta ids en crudo.
do $$
declare v_ok boolean;
begin
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'app_settings'
       and policyname = 'as_public_read' and qual like '%reviews%'
  ) into v_ok;
  if not v_ok then
    raise exception '0218 abortada: la policy as_public_read no incluye la clave reviews';
  end if;
end $$;
