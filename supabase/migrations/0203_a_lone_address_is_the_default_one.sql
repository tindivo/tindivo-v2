-- ============================================================================
-- 0203 — Si solo tienes una dirección, esa es la predeterminada
-- ============================================================================
--
-- EL AGUJERO, MEDIDO EN PROD EL 2026-09-01.
--
-- El alta de dirección del checkout
-- (`apps/customer/features/checkout/components/address-selector-sheet.tsx`)
-- insertaba sin `is_default`, así que caía al `false` de la columna. Y esa
-- rama es justo la que el checkout abre SOLA cuando el usuario no tiene
-- ninguna dirección (`addresses.length === 0`). Resultado: dos usuarios de
-- veintisiete con dirección guardada y ninguna marcada como predeterminada.
--
--   2026-08-26  Casa · San martín calle ancash
--   2026-08-28  Casa · Parque media Luna
--
-- NO ES COSMÉTICO. `cart-business-gate.tsx` consulta la dirección del cliente
-- con `.eq('is_default', true).maybeSingle()` y sin plan B —los demás sitios
-- caen a `?? addresses[0]`, ese no—, así que a estos dos el mensaje de WhatsApp
-- que se le manda al negocio les sale SIN dirección. El negocio recibe un
-- pedido sin saber a dónde va.
--
-- POR QUÉ SE PUEDE ARREGLAR SOLO. Las dos filas son la ÚNICA dirección de su
-- usuario: no hay nada que elegir. Si tuvieran varias haría falta preguntar, y
-- esta migración no las tocaría — de ahí el `having count(*) = 1`.
--
-- EL ÍNDICE ÚNICO PARCIAL `customer_addresses_default_per_user_idx` ya garantiza
-- «como mucho una». Esto arregla el otro lado —«al menos una»— para las filas
-- que ya existen; que no vuelva a pasar lo cierra el código, en las dos rutas
-- de alta que lo tenían mal (0203 va con ese cambio).
--
-- ROLLBACK: supabase/rollbacks/0203_a_lone_address_is_the_default_one.rollback.sql
-- ============================================================================

UPDATE public.customer_addresses a
SET is_default = true
WHERE a.is_default = false
  AND a.user_id IN (
    SELECT user_id
    FROM public.customer_addresses
    GROUP BY user_id
    HAVING count(*) = 1 AND bool_or(is_default) = false
  );
