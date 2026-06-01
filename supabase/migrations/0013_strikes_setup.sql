-- =============================================================================
-- 0013 · Anti-fraude: setup de strikes (no-show)
-- Documento Maestro §4: strikes anclados a número + dirección; 2 strikes ->
-- contraentrega bloqueada (solo prepago). El valor de enum y el helper se
-- definen aquí; los RPCs que los USAN viven en 0014 (transacción aparte: un
-- valor de enum nuevo no puede usarse en la misma transacción donde se crea).
-- =============================================================================

-- Razón de cancelación específica para el no-show.
alter type public.cancel_reason add value if not exists 'no_show';

-- Umbral de bloqueo configurable sin migración (default 2 = Documento Maestro).
insert into public.app_settings (key, value) values
  ('strikes', '{"blockThreshold": 2}'::jsonb)
on conflict (key) do nothing;

-- ¿Esta combinación número/dirección debe pagar SOLO por adelantado?
-- true si el número O la dirección acumulan >= umbral de strikes. Anclas
-- independientes (Maestro §4): cambiar una no limpia la otra.
create or replace function public.customer_contraentrega_blocked(p_phone text, p_reference text)
  returns boolean
  language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.customer_strikes s where s.phone = p_phone) >= v.threshold
    or (
      p_reference is not null
      and (select count(*) from public.customer_strikes s where s.delivery_reference = p_reference) >= v.threshold
    )
  from (
    select coalesce(
      (select (value ->> 'blockThreshold')::int from public.app_settings where key = 'strikes'),
      2
    ) as threshold
  ) v;
$$;

-- Solo service_role la invoca directo. Los RPCs internos (create_customer_order,
-- advance_order) son SECURITY DEFINER y la ejecutan como owner — no necesitan
-- este grant. NO se expone a authenticated: es señal anti-fraude enumerable.
revoke execute on function public.customer_contraentrega_blocked(text, text) from public, anon, authenticated;
grant execute on function public.customer_contraentrega_blocked(text, text) to service_role;
