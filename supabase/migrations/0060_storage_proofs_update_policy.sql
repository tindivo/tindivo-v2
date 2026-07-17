-- 0060_storage_proofs_update_policy.sql
-- Fase 1 Prepaid: Permitir que el cliente actualice (sobreescriba) su propio comprobante subido en storage.
-- Esto permite el reintento de carga de comprobante bajo la opción de upsert: true del frontend.

DROP POLICY IF EXISTS "storage proofs update" ON storage.objects;
CREATE POLICY "storage proofs update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id in ('payment-proofs', 'receipts')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id in ('payment-proofs', 'receipts')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
