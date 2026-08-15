-- =============================================================================
-- ROLLBACK de la 0164 · recrea pilot_whitelist
-- =============================================================================

create table if not exists public.pilot_whitelist (
  phone      text primary key check (phone ~ '^9\d{8}$'),
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

alter table public.pilot_whitelist enable row level security;
revoke all on table public.pilot_whitelist from anon, authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain
  on table public.pilot_whitelist
  to service_role;
