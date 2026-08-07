-- 0058_awaiting_payment_state.sql
-- Fase 1 Prepaid: Agregar los nuevos estados del flujo de prepago de forma aislada.
-- Al ejecutarse en Supabase/Postgres, si arroja error por múltiples alter type en la misma
-- transacción, ejecutar cada línea por separado.

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_payment';
ALTER TYPE public.cancel_reason ADD VALUE IF NOT EXISTS 'proof_rejected_final';
