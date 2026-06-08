-- 0036_antifraude_incidents_claims.sql
-- Paso 2.1 del refactor antifraude (PROMPT_GEMINI_REFACTOR_ANTIFRAUDE).
-- Spec SISTEMA_ANTIFRAUDE_TINDIVO.md ausente -> esquemas diseñados en
-- ANTIFRAUDE_PASO2_DESIGN.md (aprobado). Decisiones: #2 tablas nuevas,
-- #3 solo 3 strikes -> bloqueo temporal 30 días.
-- Cambios SOLO aditivos: el estado `validando` y las columnas de comprobante
-- existentes (comprobante_prepago_url, payment_verified_at/by) se conservan.
-- Idempotente.

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.incident_type as enum
    ('no_show','fake_address','customer_abuse','payment_fraud','rejected_proof','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fraud_claim_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ── 1. customer_incidents (log de incidentes; el admin confirma is_strike) ────
create table if not exists public.customer_incidents (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references public.orders(id) on delete set null,
  customer_user_id   uuid references public.users(id) on delete set null,
  customer_phone     text not null,
  delivery_reference text,
  incident_type      public.incident_type not null,
  description        text,
  reported_by        uuid references public.users(id) on delete set null,
  reported_by_role   text check (reported_by_role in ('driver','business','admin','system','customer')),
  is_strike          boolean not null default false,
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.users(id) on delete set null,
  review_result      text check (review_result in ('confirmed','dismissed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_customer_incidents_phone on public.customer_incidents (customer_phone);
create index if not exists idx_customer_incidents_pending on public.customer_incidents (reviewed_at) where reviewed_at is null;

-- ── 2. fraud_coverage_claims (reclamos de cobertura del fondo) ────────────────
create table if not exists public.fraud_coverage_claims (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  amount          numeric(10,2) not null check (amount >= 0),
  reason          text not null,
  evidence_url    text,
  status          public.fraud_claim_status not null default 'pending',
  resolved_at     timestamptz,
  resolved_by     uuid references public.users(id) on delete set null,
  resolution_note text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fraud_claims_pending on public.fraud_coverage_claims (status) where status = 'pending';

-- ── 3. orders: columnas de validación del PROMPT (aditivas) ───────────────────
-- (proof: se REUSAN comprobante_prepago_url / payment_verified_at / payment_verified_by)
alter table public.orders add column if not exists requires_validation boolean not null default false;
alter table public.orders add column if not exists validated_at  timestamptz;
alter table public.orders add column if not exists validated_by  uuid references public.users(id) on delete set null;
alter table public.orders add column if not exists validation_result text;
alter table public.orders drop constraint if exists orders_validation_result_check;
alter table public.orders add constraint orders_validation_result_check
  check (validation_result is null or validation_result in ('passed','failed'));

-- ── 4. customer_profiles: bloqueo temporal (3 strikes -> 30 días) ─────────────
alter table public.customer_profiles add column if not exists blocked_until timestamptz;

-- ── 5. app_settings (convención nested existente) ─────────────────────────────
update public.app_settings set value = value || '{"temporaryBlockThreshold":3,"temporaryBlockDays":30}'::jsonb where key = 'strikes';
update public.app_settings set value = value || '{"maxValidationRequestsPerDayPerBusiness":3}'::jsonb where key = 'validation';

-- ── 6. RLS en las tablas nuevas (DECISIONS.md: RLS en TODAS las tablas) ───────
-- Acceso solo server-side vía service_role (bypassa RLS). Sin policies para
-- anon/authenticated = cerrado por defecto. Policies de lectura admin se añaden
-- con los endpoints admin (Paso 2.2).
alter table public.customer_incidents enable row level security;
alter table public.fraud_coverage_claims enable row level security;

-- ── 7. Trigger: customer_incidents.is_strike -> customer_strikes (+ bloqueo) ──
create or replace function public.apply_incident_strike()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_threshold int;
  v_block_days int;
  v_count int;
begin
  if new.is_strike = true and (tg_op = 'INSERT' or coalesce(old.is_strike, false) = false) then
    -- 1) registrar el strike (reusa customer_strikes existente)
    insert into public.customer_strikes
      (customer_user_id, phone, delivery_reference, order_id, reason, reported_by)
    values
      (new.customer_user_id, new.customer_phone, new.delivery_reference,
       new.order_id, new.incident_type::text, new.reviewed_by);

    -- 2) recomputar contador + aplicar bloqueo temporal a los 3 strikes
    if new.customer_user_id is not null then
      select coalesce((value->>'temporaryBlockThreshold')::int, 3),
             coalesce((value->>'temporaryBlockDays')::int, 30)
        into v_threshold, v_block_days
        from public.app_settings where key = 'strikes';

      select count(*) into v_count
        from public.customer_strikes where customer_user_id = new.customer_user_id;

      update public.customer_profiles
        set strikes = v_count,
            blocked_until = case when v_count >= v_threshold
                                 then now() + (v_block_days || ' days')::interval
                                 else blocked_until end,
            updated_at = now()
      where user_id = new.customer_user_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_incident_apply_strike on public.customer_incidents;
create trigger trg_incident_apply_strike
  after insert or update of is_strike on public.customer_incidents
  for each row execute function public.apply_incident_strike();
