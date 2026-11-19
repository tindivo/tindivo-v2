-- 0293 · El tope de envíos de código SMS por usuario y el traslado del celular dejan de estar en el código.
--
-- · `phone_code_max_per_24h`: el tope que `send-code` tenía escrito en la ruta (3 envíos por usuario en 24 horas).
--   Arranca con el mismo valor: no cambia el comportamiento. Si la clave ya existe, no se toca (la fija quien la puso).
-- · `phone_transfer_enabled`: el lanzamiento no traslada el celular entre cuentas (decisión Q de Jesús, 2026-11-17):
--   la persona escribe a soporte por WhatsApp. Apagado, el servidor no ofrece el traslado y `transfer` lo rechaza con
--   un conflicto. La operación y las tablas se quedan por las apps instaladas (API-3).
--   Aquí SÍ se fuerza a `false` aunque la clave ya exista: es el valor seguro por defecto y la migración solo corre una
--   vez; reabrir el traslado es una decisión posterior y explícita (un UPDATE a propósito), no algo que una fila
--   previa pueda dejar encendido sin que nadie lo haya decidido para el lanzamiento.
-- · `reserve_phone_code`: la reserva ATÓMICA del envío de un código. Antes la ruta contaba y, tras llamar a Twilio,
--   insertaba: dos solicitudes simultáneas pasaban el tope y un error de conteo contaba como 0. Ahora la función
--   bloquea por usuario, cuenta las últimas 24 horas, apunta el envío si cabe y devuelve si se permite, todo en una
--   transacción y ANTES de llamar a Twilio. Si Twilio falla después, el cupo no se devuelve: ante la duda se manda menos.
--
-- Idempotente y aditiva. No toca RLS: `app_settings` y `customer_otp_attempts` conservan las suyas.
insert into public.app_settings (key, value)
values ('phone_code_max_per_24h', '3'::jsonb)
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('phone_transfer_enabled', 'false'::jsonb)
on conflict (key) do update set value = 'false'::jsonb, updated_at = now();

create or replace function public.reserve_phone_code(p_user_id uuid, p_phone text, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  if p_user_id is null or p_phone is null or p_max is null or p_max < 1 then
    raise exception 'reserve_phone_code: argumentos inválidos';
  end if;

  -- Un envío a la vez por usuario: la cuenta y el apunte no se separan entre solicitudes simultáneas.
  perform pg_advisory_xact_lock(hashtext('reserve_phone_code:' || p_user_id::text));

  select count(*) into v_used
  from public.customer_otp_attempts
  where user_id = p_user_id
    and sent_at >= now() - interval '24 hours';

  if v_used >= p_max then
    return false;
  end if;

  -- El disparador `reject_deleted_account` rechaza sellar un envío sobre una cuenta ya borrada.
  insert into public.customer_otp_attempts (user_id, phone)
  values (p_user_id, p_phone);
  return true;
end;
$$;

revoke execute on function public.reserve_phone_code(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_phone_code(uuid, text, integer) to service_role;
