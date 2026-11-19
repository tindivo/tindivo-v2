-- 0293 · El tope de envíos de código SMS por usuario y el traslado del celular dejan de estar en el código.
--
-- · `phone_code_max_per_24h`: el tope que `send-code` tenía escrito en la ruta (3 envíos por usuario en 24 horas).
--   Arranca con el mismo valor: no cambia el comportamiento.
-- · `phone_transfer_enabled`: el lanzamiento no traslada el celular entre cuentas (decisión Q de Jesús, 2026-11-17):
--   la persona escribe a soporte por WhatsApp. Apagado, el servidor no ofrece el traslado y `transfer` lo rechaza con
--   un conflicto. La operación y las tablas se quedan por las apps instaladas (API-3).
--
-- Idempotente y aditiva. No toca RLS: `app_settings` conserva sus policies.
insert into public.app_settings (key, value)
values
  ('phone_code_max_per_24h', '3'::jsonb),
  ('phone_transfer_enabled', 'false'::jsonb)
on conflict (key) do nothing;
