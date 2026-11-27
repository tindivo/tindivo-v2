-- Rollback de 0296: borra las cuatro funciones del pago único del cliente de confianza (captura, confirmación y rechazo).
-- No hay datos que migrar: las columnas de orders que usan son del prepago y se quedan, y las capturas ya subidas en payment-proofs no se borran.
-- Reabre: un pending_yape vuelve a no admitir captura. Sin CASCADE.

drop function if exists public.reject_delivery_payment_proof(uuid, uuid, int, text);
drop function if exists public.confirm_delivery_payment(uuid, uuid);
drop function if exists public.register_delivery_payment_proof(uuid, uuid, text);
drop function if exists public.delivery_payment_proof_next_attempt(uuid, uuid);
