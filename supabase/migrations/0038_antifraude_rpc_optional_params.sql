-- 0038_antifraude_rpc_optional_params.sql
-- Los params de texto opcionales de los RPCs de 0037 se declararon sin DEFAULT,
-- por lo que el generador de tipos los marca como `string` requerido y el backend
-- no puede pasarles NULL. Aquí se les da DEFAULT NULL (semántica correcta: campo
-- ausente = NULL, no ''). Bodies idénticos a 0037. Idempotente.

-- create_customer_incident: p_description reordenado al final con DEFAULT NULL
-- (reorder => DROP + CREATE; named-param rpc() no se ve afectado por el orden).
drop function if exists public.create_customer_incident(uuid, public.incident_type, text, uuid, text);
create or replace function public.create_customer_incident(
  p_order_id         uuid,
  p_incident_type    public.incident_type,
  p_reported_by      uuid,
  p_reported_by_role text,
  p_description      text default null
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
revoke execute on function public.create_customer_incident(uuid, public.incident_type, uuid, text, text) from anon, authenticated, public;

-- create_fraud_claim: p_evidence_url DEFAULT NULL (ya es el último param)
create or replace function public.create_fraud_claim(
  p_order_id uuid, p_business_user_id uuid, p_amount numeric, p_reason text, p_evidence_url text default null
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

-- resolve_fraud_claim: p_note DEFAULT NULL (ya es el último param)
create or replace function public.resolve_fraud_claim(
  p_claim_id uuid, p_resolver uuid, p_approve boolean, p_note text default null
) returns public.fraud_coverage_claims
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.fraud_coverage_claims;
begin
  select * into v_row from public.fraud_coverage_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim no existe' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending' then return v_row; end if;
  update public.fraud_coverage_claims
    set status = case when p_approve then 'approved' else 'rejected' end,
        resolved_at = now(), resolved_by = p_resolver, resolution_note = p_note, updated_at = now()
  where id = p_claim_id
  returning * into v_row;
  if p_approve then
    insert into public.contingency_advances
      (order_id, customer_phone, amount, reason, actor_charged, status, operator)
    select v_row.order_id, o.customer_phone, v_row.amount,
           'Cobertura de fraude aprobada: ' || v_row.reason, 'tindivo', 'activo', p_resolver
      from public.orders o where o.id = v_row.order_id;
  end if;
  return v_row;
end $$;
