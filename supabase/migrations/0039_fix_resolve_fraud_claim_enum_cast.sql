-- 0039_fix_resolve_fraud_claim_enum_cast.sql
-- Bugfix: en resolve_fraud_claim (0037/0038) el CASE devuelve `text` y la columna
-- `status` es el enum `fraud_claim_status`; el assignment fallaba (42804). Se castea
-- explícitamente el CASE al enum. Idempotente (CREATE OR REPLACE, misma firma).

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
    set status = (case when p_approve then 'approved' else 'rejected' end)::public.fraud_claim_status,
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
