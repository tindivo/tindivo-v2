-- =============================================================================
-- 0254 · El bucket de comprobantes de pago solo admite fotos, de hasta 15 MB
-- Idempotente. (C5 del plan de migraciones; D-40.)
--
-- `payment-proofs` quedó fuera de la 0151 y tenía `file_size_limit` y
-- `allowed_mime_types` en NULL: la RLS de la 0005 deja a cualquier usuario
-- autenticado escribir en su carpeta, así que con su token podía subir un
-- archivo de cualquier peso y tipo.
--
-- Tipos: JPEG, PNG y WebP (lo que el compresor del navegador produce) más
-- HEIC y HEIF (fotos de iPhone que llegan sin convertir). Tamaño: 15 MB, el
-- `MAX_INPUT_BYTES` de `packages/images`: quien hoy puede pagar sigue pudiendo.
-- `receipts` no se toca.
-- =============================================================================

update storage.buckets
set
  file_size_limit = 15728640, -- 15 MB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'payment-proofs';
