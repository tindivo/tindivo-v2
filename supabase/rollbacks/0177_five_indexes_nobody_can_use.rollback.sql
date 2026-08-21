-- ROLLBACK de 0177 — devuelve los cinco índices y la policy sin envolver.
--
-- Devolverlos no arregla nada: los cuatro duplicados no aportaban ninguna
-- capacidad que su gemelo único no tenga, y el GIN sigue sin tener una sola
-- consulta que pueda usarlo. Esto existe para dejar la base exactamente como
-- estaba, no porque haga falta.
--
-- Lo único que cambia de verdad al aplicarlo: los escaneos vuelven a repartirse
-- entre gemelos —el planner elegirá uno de los dos— y `auth.uid()` vuelve a
-- reevaluarse por fila en `business_charges`.

-- ── Los cuatro duplicados, tal como los creaba la 0002 ───────────────────────

create index if not exists drivers_user_id_idx on public.drivers (user_id);
create index if not exists businesses_user_id_idx on public.businesses (user_id);
create index if not exists orders_short_id_idx on public.orders (short_id);
create index if not exists ps_user_idx on public.push_subscriptions (user_id);

-- ── El GIN ───────────────────────────────────────────────────────────────────

create index if not exists orders_risk_flags_gin_idx on public.orders using gin (risk_flags);

-- ── La policy, con auth.uid() sin envolver (versión 0073) ────────────────────

drop policy if exists "Business can view own charges" on public.business_charges;
create policy "Business can view own charges"
  on public.business_charges for select
  using (
    business_id in (
      select id from public.businesses
      where user_id = auth.uid()
    )
  );
