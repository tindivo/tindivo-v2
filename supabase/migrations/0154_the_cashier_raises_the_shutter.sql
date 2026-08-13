-- =============================================================================
-- 0154 · Apertura del día: el negocio declara si hoy atiende
-- Idempotente.
--
-- Spec: Docs/spec/spec-horarios-y-apertura.md (capa "Apertura del día", R7-R11).
--
-- Hasta ahora un negocio con horario semanal configurado figuraba abierto
-- siempre, aunque ese jueves no hubiera luz. Esta tabla es la declaración
-- diaria: una fila por negocio y jornada.
--
-- Ausencia de fila = sin confirmar. No hace falta un tercer estado: el "no
-- confirmado" es justamente que no hay fila. `status = 'closed'` es distinto,
-- es el "hoy no atendemos" dicho a propósito, y por eso puede llevar nota.
--
-- OJO: esta migración solo GUARDA la declaración. Todavía no bloquea pedidos
-- ni cambia lo que ve el cliente; eso llega cuando se ate a la cadena del
-- spec. Se hace en dos pasos para poder probar la captura sin tocar el flujo
-- de pedidos.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Fecha de servicio
--
-- No es la fecha de calendario. Un negocio que cierra a la 1 de la madrugada
-- sigue en la jornada del día anterior: si usáramos la fecha natural, a las
-- 00:00 le saltaría otra vez el "¿abren hoy?" en plena faena.
--
-- La jornada arranca a las 05:00 de Lima. Es un corte arbitrario pero seguro:
-- nadie reparte a esa hora, así que ninguna jornada real lo cruza.
-- ----------------------------------------------------------------------------
create or replace function public.current_service_date(p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (timezone('America/Lima', coalesce(p_at, now())) - interval '5 hours')::date
$$;

comment on function public.current_service_date is
  'Jornada operativa a la que pertenece un instante. Empieza a las 05:00 de Lima para que la madrugada cuente como el día anterior.';

-- ----------------------------------------------------------------------------
-- Declaración del día
-- ----------------------------------------------------------------------------
create table if not exists public.business_service_days (
  business_id     uuid not null references public.businesses(id) on delete cascade,
  service_date    date not null,
  status          text not null check (status in ('open', 'closed')),
  closes_early_at text,
  note            text,
  confirmed_at    timestamptz not null default now(),
  confirmed_by    uuid references public.users(id),
  primary key (business_id, service_date)
);

comment on table public.business_service_days is
  'Declaracion diaria de apertura. Sin fila = sin confirmar = cerrado.';
comment on column public.business_service_days.closes_early_at is
  'HH:MM opcional. Adelanta el cierre del turno de hoy sin tocar el horario semanal.';

alter table public.business_service_days enable row level security;

-- Mismo patrón que business_schedule (0005): el dueño manda en sus filas.
drop policy if exists "bsd_owner_all" on public.business_service_days;
create policy "bsd_owner_all" on public.business_service_days for all to authenticated
  using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));

drop policy if exists "bsd_admin_all" on public.business_service_days;
create policy "bsd_admin_all" on public.business_service_days for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

-- Lectura pública: el catálogo tendrá que saber si el negocio abrió, igual que
-- ya lee `business_schedule`.
drop policy if exists "bsd_public_read" on public.business_service_days;
create policy "bsd_public_read" on public.business_service_days for select to anon, authenticated
  using (true);
