-- 0037_antifraude_rpcs_and_rls.sql
-- Paso 2.2 (capa de datos): RPCs idempotentes del flujo antifraude nuevo +
-- RLS policies explícitas en las tablas nuevas + hardening del trigger fn.
-- Todas SECURITY DEFINER con search_path='' (invariante DECISIONS.md).
-- Decisiones de diseño (spec ausente, ver ANTIFRAUDE_PASO2_DESIGN.md):
--   · review idempotente: solo la primera revisión cuenta.
--   · claim aprobado -> genera contingency_advances (reusa el fondo existente).
--   · rate-limit de validación: máx N órdenes con requires_validation por
--     negocio/día (created_at del día), N = app_settings.validation.maxValidationRequestsPerDayPerBusiness.

-- ── A. Hardening: el trigger fn no debe ser callable como RPC público ─────────
revoke execute on function public.apply_incident_strike() from anon, authenticated, public;

-- ── B. RLS policies explícitas (acceso de escritura es server-side/service_role)
drop policy if exists incidents_admin_read on public.customer_incidents;
create policy incidents_admin_read on public.customer_incidents
  for select to authenticated using (public.current_user_has_role('admin'));

drop policy if exists claims_admin_read on public.fraud_coverage_claims;
create policy claims_admin_read on public.fraud_coverage_claims
  for select to authenticated using (public.current_user_has_role('admin'));

drop policy if exists claims_business_read on public.fraud_coverage_claims;
create policy claims_business_read on public.fraud_coverage_claims
  for select to authenticated using (business_id = public.current_business_id());

-- ── C. create_customer_incident — motorizado/negocio reporta un incidente ────
create or replace function public.create_customer_incident(
  p_order_id        uuid,
  p_incident_type   public.incident_type,
  p_description     text,
  p_reported_by     uuid,
  p_reported_by_role text
) returns public.customer_incidents
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_row   public.customer_incidents;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;

  insert into public.customer_incidents
    (order_id, customer_user_id, customer_phone, delivery_reference,
     incident_type, description, reported_by, reported_by_role)
  values
    (p_order_id, v_order.customer_user_id, v_order.customer_phone, v_order.delivery_reference,
     p_incident_type, p_description, p_reported_by, p_reported_by_role)
  returning * into v_row;
  return v_row;
end $$;

-- ── D. review_customer_incident — admin confirma (is_strike) o desestima ──────
create or replace function public.review_customer_incident(
  p_incident_id uuid,
  p_reviewer    uuid,
  p_result      text                       -- 'confirmed' | 'dismissed'
) returns public.customer_incidents
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.customer_incidents;
begin
  if p_result not in ('confirmed','dismissed') then
    raise exception 'Resultado inválido: %', p_result using errcode = '22023';
  end if;
  select * into v_row from public.customer_incidents where id = p_incident_id for update;
  if not found then raise exception 'Incidente no existe' using errcode = 'P0002'; end if;
  if v_row.reviewed_at is not null then
    return v_row;                          -- idempotente: ya revisado
  end if;
  update public.customer_incidents
    set reviewed_at   = now(),
        reviewed_by   = p_reviewer,
        review_result = p_result,
        is_strike     = (p_result = 'confirmed'),  -- el trigger materializa strike + bloqueo
        updated_at    = now()
  where id = p_incident_id
  returning * into v_row;
  return v_row;
end $$;

-- ── E. request_order_validation — negocio marca un pedido para validar ───────
create or replace function public.request_order_validation(
  p_order_id         uuid,
  p_business_user_id uuid
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_biz_id uuid;
  v_order  public.orders;
  v_max    int;
  v_today  int;
begin
  select id into v_biz_id from public.businesses where user_id = p_business_user_id;
  if v_biz_id is null then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.business_id <> v_biz_id then raise exception 'Pedido de otro negocio' using errcode = '42501'; end if;

  if v_order.requires_validation then
    return v_order;                        -- idempotente: ya marcado
  end if;

  select coalesce((value->>'maxValidationRequestsPerDayPerBusiness')::int, 3)
    into v_max from public.app_settings where key = 'validation';
  select count(*) into v_today
    from public.orders
    where business_id = v_biz_id and requires_validation = true
      and created_at >= date_trunc('day', now());
  if v_today >= v_max then
    raise exception 'Límite de % validaciones por día alcanzado', v_max using errcode = 'P0001';
  end if;

  update public.orders set requires_validation = true where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- ── F. create_fraud_claim — negocio reclama cobertura por un pedido ──────────
create or replace function public.create_fraud_claim(
  p_order_id         uuid,
  p_business_user_id uuid,
  p_amount           numeric,
  p_reason           text,
  p_evidence_url     text
) returns public.fraud_coverage_claims
language plpgsql security definer set search_path = '' as $$
declare
  v_biz_id uuid;
  v_order  public.orders;
  v_row    public.fraud_coverage_claims;
begin
  select id into v_biz_id from public.businesses where user_id = p_business_user_id;
  if v_biz_id is null then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.business_id <> v_biz_id then raise exception 'Pedido de otro negocio' using errcode = '42501'; end if;

  insert into public.fraud_coverage_claims (order_id, business_id, amount, reason, evidence_url, created_by)
  values (p_order_id, v_biz_id, p_amount, p_reason, p_evidence_url, p_business_user_id)
  returning * into v_row;
  return v_row;
end $$;

-- ── G. resolve_fraud_claim — admin aprueba (genera contingency_advance) o rechaza
create or replace function public.resolve_fraud_claim(
  p_claim_id uuid,
  p_resolver uuid,
  p_approve  boolean,
  p_note     text
) returns public.fraud_coverage_claims
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.fraud_coverage_claims;
begin
  select * into v_row from public.fraud_coverage_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim no existe' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending' then
    return v_row;                          -- idempotente: ya resuelto
  end if;

  update public.fraud_coverage_claims
    set status          = case when p_approve then 'approved' else 'rejected' end,
        resolved_at     = now(),
        resolved_by     = p_resolver,
        resolution_note = p_note,
        updated_at      = now()
  where id = p_claim_id
  returning * into v_row;

  -- aprobado -> adelanto del fondo de contingencia (reusa la tabla existente)
  if p_approve then
    insert into public.contingency_advances
      (order_id, customer_phone, amount, reason, actor_charged, status, operator)
    select v_row.order_id, o.customer_phone, v_row.amount,
           'Cobertura de fraude aprobada: ' || v_row.reason, 'tindivo', 'activo', p_resolver
      from public.orders o where o.id = v_row.order_id;
  end if;
  return v_row;
end $$;

-- ── H. customer_is_blocked — helper de checkout (3 strikes -> bloqueo temporal)
create or replace function public.customer_is_blocked(p_user_id uuid, p_phone text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_blocked boolean := false;
begin
  if p_user_id is not null then
    select coalesce(blocked_until > now(), false) into v_blocked
      from public.customer_profiles where user_id = p_user_id;
    if v_blocked then return true; end if;
  end if;
  return false;
end $$;

revoke execute on function public.create_customer_incident(uuid, public.incident_type, text, uuid, text) from anon, authenticated, public;
revoke execute on function public.review_customer_incident(uuid, uuid, text) from anon, authenticated, public;
revoke execute on function public.request_order_validation(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.create_fraud_claim(uuid, uuid, numeric, text, text) from anon, authenticated, public;
revoke execute on function public.resolve_fraud_claim(uuid, uuid, boolean, text) from anon, authenticated, public;
revoke execute on function public.customer_is_blocked(uuid, text) from anon, authenticated, public;
