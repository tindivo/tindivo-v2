-- =============================================================================
-- 0015 · Cada strike alimenta la bandeja del admin (Documento Maestro §5)
-- Un strike (no-show u otro) crea automáticamente un reporte 'open' para que
-- el fundador lo revise con calma. Decoplado vía trigger: la lógica de strike
-- (0014) no necesita conocer la bandeja.
-- =============================================================================

create or replace function public.create_report_for_strike()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.reports (
    type, status, order_id, customer_user_id, customer_phone, created_by, description
  ) values (
    'no_show', 'open', new.order_id, new.customer_user_id, new.phone, new.reported_by,
    'No-show: strike anclado a ' || coalesce(new.delivery_reference, 'dirección sin referencia')
  );
  return new;
end;
$$;

drop trigger if exists trg_strike_creates_report on public.customer_strikes;
create trigger trg_strike_creates_report
  after insert on public.customer_strikes
  for each row execute function public.create_report_for_strike();

-- El trigger corre como definer; revoca ejecución directa por seguridad.
revoke execute on function public.create_report_for_strike() from public, anon, authenticated;
