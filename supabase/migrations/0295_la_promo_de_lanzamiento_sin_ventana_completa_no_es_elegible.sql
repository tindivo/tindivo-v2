-- 0295 · La promo de envío gratis del lanzamiento sin ventana completa no es elegible.
--
-- El problema (CAX-004, auditoría de Codex sobre #244): `current_customer_promo_free_delivery` (0187), la que
-- usa la cotización para PINTAR «envío gratis», decía `eligible: true` con la promoción activa, con código y con
-- cupo pero SIN fechas (`from` o `to` ausentes o `null`). `public.current_service_date() between NULL and NULL` da
-- NULL, `NOT NULL` sigue siendo NULL, y un `IF NULL` no entra en el rechazo: la función seguía hasta el final.
-- `create_customer_order` (0283:377-381) exige la ventana VERDADERA —un `IF NULL` no entra— y no aplica la promoción.
-- Resultado: la cotización anunciaba un envío gratis que la creación no daba (total más bajo en pantalla que el real).
--
-- La regla ya era la de la creación: la promo solo aplica con la ventana completa y verdadera (el principio de
-- 0187: «un campo que falte cierra la promo y no la abre»). Esta migración solo hace que el helper de la cotización
-- diga lo mismo. NO toca `create_customer_order` ni ninguna otra regla: ni el tope, ni el código, ni el teléfono, ni
-- las redenciones previas.
--
-- Qué cambia: con `from` o `to` ausentes o `null`, la función responde `eligible: false, reason: 'inactive'` (igual
-- que con la configuración a medias: sin código o sin tope). Con la ventana completa, todo queda como estaba:
-- `outside_window` fuera de rango, y el resto de motivos en el mismo orden.
--
-- Los demás lectores de la ventana: `create_customer_order` (0283, ya correcto) y `admin_promo_free_delivery_stats`
-- (0187), que solo REPORTA `from` y `to` tal como están, sin decidir nada. `cart_item_free_delivery` (0230) no lee
-- esta promoción: es la del plato.
--
-- Idempotente (`CREATE OR REPLACE` conserva el ACL; se vuelven a declarar los permisos de 0187/0188).
-- Cuerpo = 0187:838-911 (la función) con el único cambio marcado «0295»; comentario y permisos: 0187:913-917 y 0188:67-68.
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
  -- 0295: `from` y `to` también son obligatorios; sin ellos la ventana no es verdadera
  -- y `create_customer_order` no aplica la promoción.
  if not found
     or not coalesce((v_promo ->> 'active')::boolean, false)
     or (v_promo ->> 'code') is null
     or (v_promo ->> 'max_redemptions') is null
     or (v_promo ->> 'from') is null
     or (v_promo ->> 'to') is null
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
  'Elegibilidad de promo de envío del usuario actual, para PINTAR. Quien decide es create_customer_order. Sin ventana completa (from y to) no es elegible (0295).';

revoke all on function public.current_customer_promo_free_delivery() from public, anon;
grant execute on function public.current_customer_promo_free_delivery() to authenticated, service_role;
