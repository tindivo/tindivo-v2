-- =============================================================================
-- 0258 · Los comprobantes en Storage no se sobrescriben
-- =============================================================================
--
-- QUÉ CAMBIA
-- La policy `storage proofs update` (0060) dejaba al dueño sobrescribir
-- cualquier objeto de su carpeta en `payment-proofs` y `receipts`. Se recrea
-- solo para `receipts`: en `payment-proofs` el cliente puede INSERTAR y LEER,
-- pero ya no ACTUALIZAR.
--
-- POR QUÉ
-- 0249 impide cambiar la URL registrada en el pedido, pero el archivo seguía
-- siendo mutable: el cliente podía subir otra imagen bajo la MISMA ruta y la
-- cajera revisaría algo distinto de lo que se registró. La app no necesita el
-- UPDATE: sube cada intento a una ruta nueva
-- (`<usuario>/<pedido>/attempt-<n>-<ts>.<ext>`) y no usa `upsert`.
-- (Admin conserva `storage admin all`; el service role no pasa por RLS.)
--
-- REVERSIBILIDAD: recrear la policy de 0060 con ambos buckets.
-- =============================================================================

DROP POLICY IF EXISTS "storage proofs update" ON storage.objects;
CREATE POLICY "storage proofs update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
