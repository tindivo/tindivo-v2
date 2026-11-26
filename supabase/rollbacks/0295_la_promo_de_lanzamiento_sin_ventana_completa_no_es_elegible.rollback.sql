-- Rollback de 0295: current_customer_promo_free_delivery vuelve al cuerpo de 0187 (la ventana ausente o null no cierra la promo en la cotización).
-- Reabre CAX-004: con from o to ausentes la cotización anuncia un envío gratis que create_customer_order no aplica. Solo si hay una razón de peso.
-- CREATE OR REPLACE conserva el ACL (0188).

create or replace function public.current_customer_promo_free_delivery()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_promo jsonb;
  v_code text;
  v_max int;
  v_phone text;
  v_taken int;
begin
  if v_uid is null then
    return jsonb_build_object('eligible', false, 'reason', 'inactive', 'code', null);
  end if;

  select value into v_promo from public.app_settings where key = 'promo_free_delivery';

  -- Config ausente o apagada. Mismo criterio que la sección D: explícito, y en
  -- polaridad positiva, para que un campo que falte cierre la promo y no la abra.
  if not found
     or not coalesce((v_promo ->> 'active')::boolean, false)
     or (v_promo ->> 'code') is null
     or (v_promo ->> 'max_redemptions') is null
  then
    return jsonb_build_object('eligible', false, 'reason', 'inactive', 'code', null);
  end if;

  v_code := v_promo ->> 'code';
  v_max  := (v_promo ->> 'max_redemptions')::int;

  if not (public.current_service_date()
          between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date) then
    return jsonb_build_object('eligible', false, 'reason', 'outside_window', 'code', v_code);
  end if;

  select cp.phone into v_phone
    from public.customer_profiles cp
   where cp.user_id = v_uid and cp.phone_verified_at is not null;

  -- Sin teléfono verificado no hay promo, pero tampoco hay pedido: el guard de
  -- `create_customer_order` corta antes. Se responde `inactive` para no pintar
  -- un cartel de promo a quien todavía no ha verificado.
  if v_phone is null then
    return jsonb_build_object('eligible', false, 'reason', 'inactive', 'code', v_code);
  end if;

  -- Cubre también la reserva en curso (`reserved`), no solo la redimida.
  if exists (
    select 1 from public.promo_redemptions pr
     where pr.promo_code = v_code
       and pr.status in ('reserved', 'redeemed')
       and (pr.customer_user_id = v_uid or pr.verified_phone = v_phone)
  ) then
    return jsonb_build_object('eligible', false, 'reason', 'already_redeemed', 'code', v_code);
  end if;

  -- MISMA EXPRESIÓN que el tope de la sección D y que el contador de la G. Si
  -- una de las tres cambia sin las otras, el checkout dice una cosa, el candado
  -- hace otra y el panel enseña una tercera.
  select count(*) into v_taken
    from public.promo_redemptions
   where promo_code = v_code and status in ('reserved', 'redeemed');

  if v_taken >= v_max then
    return jsonb_build_object('eligible', false, 'reason', 'exhausted', 'code', v_code);
  end if;

  return jsonb_build_object('eligible', true, 'reason', 'active', 'code', v_code);
end;
$$;

comment on function public.current_customer_promo_free_delivery is
  'Elegibilidad de promo de envío del usuario actual, para PINTAR. Quien decide es create_customer_order.';

revoke all on function public.current_customer_promo_free_delivery() from public;
grant execute on function public.current_customer_promo_free_delivery() to authenticated, service_role;
