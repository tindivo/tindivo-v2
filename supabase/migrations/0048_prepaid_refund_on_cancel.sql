-- 0048_prepaid_refund_on_cancel.sql
-- #3: cuando un PREPAGO se cancela y el cliente YA pagó, registrar la deuda.
-- El dinero del prepago va directo al Yape/Plin del NEGOCIO, así que el negocio le
-- debe la devolución al cliente. Un único trigger centraliza la política para TODOS
-- los caminos de cancelación (validate_order, advance_order, cron de timeout):
--
--   · payment_proof_status = 'verified' y cancela el negocio/admin
--       → AUTO-DEUDA al restaurante: create_contingency_advance(actor='restaurante')
--         (inserta el adelanto, descuenta del fondo y suma a businesses.balance_due).
--   · comprobante subido pero NO verificado (timeout sin validar / marcado inválido)
--       → BANDEJA DEL ADMIN: report 'prepay_refund_review' para revisión humana.
--   · prepago sin comprobante (el cliente nunca pagó) → nada.
--   · no_show → fuera de alcance (tiene su propio flujo de strike/reporte).
--
-- Decisión confirmada con el usuario: "auto-deuda solo si fue VERIFICADO". El resto a
-- revisión del admin (consistente con el antifraude humano de Tindivo).
-- Idempotente. SECURITY DEFINER + search_path=''. No actualiza orders → no recursa.

create or replace function public.handle_prepaid_refund_on_cancel()
  returns trigger
  language plpgsql
  security definer set search_path = ''
as $$
declare
  v_amount numeric;
  v_reason text;
begin
  if new.payment_intent <> 'prepaid' then
    return new;
  end if;

  v_amount := coalesce(new.order_amount, 0) + coalesce(new.delivery_fee, 0);
  v_reason := coalesce(new.cancel_reason::text, '');

  -- El no-show es responsabilidad del cliente, no del restaurante: no se cobra deuda
  -- automática ni se abre reporte de devolución aquí (lo maneja el flujo de no-show).
  if v_reason = 'no_show' then
    return new;
  end if;

  if new.payment_proof_status = 'verified'
     and v_amount > 0
     and v_reason in ('business_cancelled', 'admin_cancelled', 'pending_acceptance_timeout') then
    -- Cliente pagó y el negocio lo confirmó: deuda automática al restaurante.
    begin
      perform public.create_contingency_advance(
        new.id,
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente',
        'restaurante',
        new.cancelled_by
      );
    exception when others then
      -- Nunca abortar la cancelación por la lógica de devolución: caer a revisión del admin.
      insert into public.reports (
        type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
      ) values (
        'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
        new.customer_phone,
        'Prepago verificado cancelado: la deuda automática falló (' || sqlerrm ||
          '). Registrar la devolución manualmente.',
        new.cancelled_by
      );
    end;

  elsif new.comprobante_prepago_url is not null then
    -- Comprobante subido pero sin verificar: a la bandeja del admin para decidir.
    insert into public.reports (
      type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
    ) values (
      'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
      new.customer_phone,
      'Prepago cancelado (' || coalesce(nullif(v_reason, ''), 'sin motivo') ||
        ') con comprobante sin verificar. Revisar si corresponde devolución de S/ ' ||
        to_char(v_amount, 'FM999990.00') || '.',
      new.cancelled_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_prepaid_refund on public.orders;
create trigger trg_orders_prepaid_refund
  after update of status on public.orders
  for each row
  when (old.status is distinct from 'cancelled' and new.status = 'cancelled')
  execute function public.handle_prepaid_refund_on_cancel();

-- Es una función de trigger: no debe ser invocable vía /rest/v1/rpc (hardening, como el
-- resto de trigger functions del proyecto). El trigger se dispara igual (corre como owner).
revoke all on function public.handle_prepaid_refund_on_cancel() from public, anon, authenticated;
