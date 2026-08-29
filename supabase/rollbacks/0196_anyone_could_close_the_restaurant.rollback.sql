-- Rollback para 0196_anyone_could_close_the_restaurant.sql
--
-- Devuelve los grants al estado que dejó la 0180: `authenticated` y
-- `service_role` con EXECUTE.
--
-- NO RESTAURA EL EXECUTE DE `anon`, A PROPÓSITO
--   El estado anterior a la 0196 exponía `block_business` y
--   `request_order_validation` a cualquiera con la anon key, sin sesión. Eso no
--   era una decisión de diseño: era el PUBLIC por defecto que la 0180 se dejó
--   sin revocar. Un rollback que lo reponga no restaura una funcionalidad,
--   reabre el agujero.
--
--   Si de verdad necesitas reproducir el estado exacto de antes —para un
--   post-mortem, no para producción— es una línea, y escríbela a mano sabiendo
--   lo que haces:
--     GRANT EXECUTE ON FUNCTION public.block_business(uuid, text, uuid, boolean) TO anon;
--
-- CUÁNDO QUERRÍAS CORRER ESTO
--   Solo si revocar a `authenticated` rompiera algún camino que no vi. Hoy no
--   hay ninguno: las dos RPC se llaman desde el API con el cliente de servicio
--   (`admin/businesses/[id]/block` y `business/orders/[id]/request-validation`),
--   y los tests de integración usan la service_role key.
--
-- IDEMPOTENTE.

GRANT EXECUTE ON FUNCTION public.block_business(uuid, text, uuid, boolean)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.request_order_validation(uuid, uuid)
  TO authenticated, service_role;
