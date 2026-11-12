-- ============================================================================
-- 0285 — caja y reclamos económicos: los textos y las imágenes vencen a los 5 años
-- ============================================================================
-- Sigue a 0284 (usa sus ayudantes `retention_ref_*`). Va en migración aparte porque toca
-- tablas de dinero: requiere la revisión explícita de Jesús antes de aplicarse (invariante 9).
-- No toca importes, estados ni fechas de negocio, `business_charges` ni `balance_due`.
-- ============================================================================
-- 5 · Caja y reclamos económicos — tablas de dinero (invariante 9: revisión de Jesús)
-- ============================================================================
-- Plazo: 5 años contados desde el 1 de enero del año (de Lima) siguiente a `created_at`.
-- Vence el registro cuyo plazo terminó ANTES de hoy en Lima: el de un año Y vence cuando
-- `make_date(Y + 1 + 5, 1, 1) < hoy`. Solo se anulan textos y se borran imágenes: los
-- importes, los estados y las fechas no se tocan, y no se borra ninguna fila.
--   · `cash_settlements`: `dispute_note` y `resolution_note` → NULL. Una liquidación en
--     disputa (`disputed`) no se toca. Su trigger `touch_cash_settlements` actualiza
--     `updated_at` (registra la anonimización; no es una fecha de negocio).
--   · `fraud_coverage_claims`: `reason` → 'Dato eliminado' (la columna es NOT NULL; mismo
--     marcador que 0278), `resolution_note` y `evidence_url` → NULL; la imagen se borra de
--     Storage ANTES, salvo que otra fila la use. Un reclamo pendiente no se toca.
--   · `contingency_advances`: ya no existe (la eliminó la 0123); no hay nada que purgar.
-- Parámetro: `data_retention.cashRecordsYears` (entero 1–100). Se añade sin pisar un valor ya
-- puesto; si falta o es inválido, no se toca nada (falla cerrada).
-- ============================================================================

update public.app_settings
set value = value || '{"cashRecordsYears": 5}'::jsonb
where key = 'data_retention'
  and not (value ? 'cashRecordsYears');

-- Medianoche de Lima del 1 de enero del primer año que AÚN no vence: vence lo creado antes.
create or replace function public.retention_cash_cutoff()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw   jsonb;
  v_years integer;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_year  integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_last  integer;
begin
  select s.value -> 'cashRecordsYears' into v_raw
  from public.app_settings s
  where s.key = 'data_retention';

  if v_raw is null or jsonb_typeof(v_raw) <> 'number' then
    return null;
  end if;
  if (v_raw #>> '{}')::numeric <> trunc((v_raw #>> '{}')::numeric)
     or (v_raw #>> '{}')::numeric < 1
     or (v_raw #>> '{}')::numeric > 100 then
    return null;
  end if;
  v_years := (v_raw #>> '{}')::integer;

  -- Último año Y con make_date(Y + 1 + N, 1, 1) < hoy. El 1 de enero, el plazo que termina
  -- ese mismo día todavía no venció.
  v_last := case when v_today = make_date(v_year, 1, 1)
                 then v_year - 2 - v_years
                 else v_year - 1 - v_years end;

  return make_date(v_last + 1, 1, 1)::timestamp at time zone 'America/Lima';
end;
$$;

revoke execute on function public.retention_cash_cutoff() from public, anon, authenticated;
grant execute on function public.retention_cash_cutoff() to service_role;

-- ── cash_settlements: notas de disputa y de resolución ──────────────────────
create or replace function public.anonymize_old_cash_settlement_notes(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cash_cutoff();
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  update public.cash_settlements cs set
    dispute_note = null,
    resolution_note = null
  where cs.id in (
    select x.id from public.cash_settlements x
    where x.created_at < v_cutoff
      and x.status <> 'disputed'
      and (x.dispute_note is not null or x.resolution_note is not null)
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.anonymize_old_cash_settlement_notes(integer) from public, anon, authenticated;
grant execute on function public.anonymize_old_cash_settlement_notes(integer) to service_role;

-- ── fraud_coverage_claims: motivo, nota y evidencia (con su imagen) ─────────
create or replace function public.retention_fraud_claim_due(
  p_claim  public.fraud_coverage_claims,
  p_cutoff timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_cutoff is not null
     and p_claim.status <> 'pending'
     and p_claim.created_at < p_cutoff
     and (p_claim.reason is distinct from 'Dato eliminado'
          or p_claim.resolution_note is not null
          or public.retention_ref_is_path(p_claim.evidence_url));
$$;

revoke execute on function public.retention_fraud_claim_due(public.fraud_coverage_claims, timestamptz)
  from public, anon, authenticated;
grant execute on function public.retention_fraud_claim_due(public.fraud_coverage_claims, timestamptz)
  to service_role;

create or replace function public.list_fraud_claim_retention_due(p_limit integer, p_after_id uuid default null)
returns table (row_id uuid, objects jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cash_cutoff();
begin
  if v_cutoff is null then
    return;
  end if;
  return query
  select c.id,
         coalesce((
           select jsonb_agg(jsonb_build_object('bucket', o.bucket, 'path', o.path)
                            order by o.bucket, o.path)
           from public.retention_ref_objects(c.evidence_url) o
           where not public.retention_ref_shared(c.evidence_url, 'fraud_coverage_claims', c.id)
         ), '[]'::jsonb)
  from public.fraud_coverage_claims c
  where public.retention_fraud_claim_due(c, v_cutoff)
    and (p_after_id is null or c.id > p_after_id)
  order by c.id
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke execute on function public.list_fraud_claim_retention_due(integer, uuid) from public, anon, authenticated;
grant execute on function public.list_fraud_claim_retention_due(integer, uuid) to service_role;

-- Devuelve: ok | not_due | not_found. Se llama antes de tocar Storage.
create or replace function public.fraud_claim_retention_precheck(p_claim_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claim public.fraud_coverage_claims%rowtype;
begin
  select * into v_claim from public.fraud_coverage_claims where id = p_claim_id;
  if not found then
    return 'not_found';
  end if;
  if not public.retention_fraud_claim_due(v_claim, public.retention_cash_cutoff()) then
    return 'not_due';
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.fraud_claim_retention_precheck(uuid) from public, anon, authenticated;
grant execute on function public.fraud_claim_retention_precheck(uuid) to service_role;

-- Devuelve: anonymized | ref_kept | not_due | not_found | object_remains (como los reportes).
-- `amount`, `status`, `resolved_at` y las demás fechas no se tocan.
create or replace function public.finish_fraud_claim_retention(p_claim_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim    public.fraud_coverage_claims%rowtype;
  v_keep_ref boolean;
begin
  select * into v_claim from public.fraud_coverage_claims where id = p_claim_id for update;
  if not found then
    return 'not_found';
  end if;
  if not public.retention_fraud_claim_due(v_claim, public.retention_cash_cutoff()) then
    return 'not_due';
  end if;

  if public.retention_ref_is_path(v_claim.evidence_url)
     and exists (select 1 from public.retention_ref_objects(v_claim.evidence_url))
     and not public.retention_ref_shared(v_claim.evidence_url, 'fraud_coverage_claims', p_claim_id) then
    return 'object_remains';
  end if;

  v_keep_ref := v_claim.evidence_url is not null
                and not public.retention_ref_is_path(v_claim.evidence_url);

  update public.fraud_coverage_claims set
    reason = 'Dato eliminado',
    resolution_note = null,
    evidence_url = case when v_keep_ref then evidence_url else null end
  where id = p_claim_id;

  return case when v_keep_ref then 'ref_kept' else 'anonymized' end;
end;
$$;

revoke execute on function public.finish_fraud_claim_retention(uuid) from public, anon, authenticated;
grant execute on function public.finish_fraud_claim_retention(uuid) to service_role;

do $check_caja$
declare
  v_name   text;
  n        int;
  v_secdef boolean;
  v_cfg    text[];
begin
  foreach v_name in array array[
    'retention_cash_cutoff', 'anonymize_old_cash_settlement_notes', 'retention_fraud_claim_due',
    'list_fraud_claim_retention_due', 'fraud_claim_retention_precheck', 'finish_fraud_claim_retention'
  ] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if n <> 1 then
      raise exception '0285: se esperaba UNA sola % y hay %', v_name, n;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if not v_secdef or v_cfg is distinct from array['search_path=""'] then
      raise exception '0285: % sin SECURITY DEFINER o sin search_path vacío', v_name;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_name
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute')
           or not has_function_privilege('service_role', p.oid, 'execute'))
    ) then
      raise exception '0285: permisos de % incorrectos (solo service_role)', v_name;
    end if;
  end loop;
  if not exists (select 1 from public.app_settings
                  where key = 'data_retention' and value ? 'cashRecordsYears') then
    raise exception '0285: falta data_retention.cashRecordsYears';
  end if;
end
$check_caja$;
