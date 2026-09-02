-- ============================================================================
-- ROLLBACK 0202 — La plaza no era la casa de nadie
-- ============================================================================
--
-- Devolver la tabla a como estaba PIERDE información que no se puede
-- reconstruir: qué direcciones habían sido confirmadas por una persona y con
-- qué precisión. Volver a deducirlo exige repetir la comparación contra el
-- centro de cobertura, y eso solo distingue a las plantadas en la plaza — no a
-- las que se confirmaron a mano después.
-- ============================================================================

DROP INDEX IF EXISTS public.customer_addresses_unconfirmed_idx;

ALTER TABLE public.customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_location_accuracy_positive;

ALTER TABLE public.customer_addresses
  DROP COLUMN IF EXISTS location_accuracy_m,
  DROP COLUMN IF EXISTS location_confirmed_at;
