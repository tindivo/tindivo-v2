-- =============================================================================
-- ROLLBACK 0144 · Elimina el RPC de autocompletado del directorio
-- =============================================================================
--
-- La 0144 solo AÑADE una función de lectura. No modificó ninguna existente, ni
-- tocó tablas, policies o datos — así que revertirla es borrarla y nada más.
--
-- ANTES DE CORRER ESTO: la UI del formulario manual (`apps/negocios`, feature
-- `nuevo`) llama a esta función. Borrarla con la UI desplegada deja el
-- autocompletado devolviendo error en cada teléfono de 9 dígitos.
--
-- El formulario está construido para degradarse (spec_ui_cajera.md B6: nombre y
-- dirección quedan editables a mano y el botón de crear pedido NUNCA se
-- bloquea por un fallo de lookup), así que la cajera puede seguir trabajando.
-- Pero es degradación, no funcionamiento normal: revertí también el cliente.
-- =============================================================================

DROP FUNCTION IF EXISTS public.search_address_directory(text);
