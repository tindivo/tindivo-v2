-- =============================================================================
-- 0151 · Topes de tamaño y tipo en los buckets de imágenes del negocio
-- Idempotente.
--
-- Los tres buckets estaban con `file_size_limit` y `allowed_mime_types` en
-- NULL, así que la ÚNICA validación era la del navegador. Y la del navegador
-- se salta sola: la RLS de 0005 deja a cualquier negocio autenticado escribir
-- en su carpeta, así que con el token de sesión se podía meter un archivo de
-- cualquier peso y de cualquier tipo — un vídeo, un zip— sin que nada lo
-- parase.
--
-- Ahora el dashboard comprime en el cliente antes de subir y las imágenes
-- salen en cientos de KB. El tope de 3 MB no es el objetivo, es el techo: deja
-- pasar de sobra cualquier cosa que produzca el compresor (incluido un QR
-- guardado sin pérdida, que es lo más pesado que generamos) y corta el abuso.
--
-- Los tipos permitidos son exactamente los tres que el compresor puede
-- producir: WebP normalmente, JPEG o PNG cuando el navegador no sabe escribir
-- WebP. Si algún día se añade un formato de salida, hay que tocarlo aquí.
--
-- `payment-proofs` y `receipts` se quedan fuera a propósito: son otro flujo
-- (cliente y admin), no se comprimen todavía y no sé si alguien sube PDFs.
-- Restringirlos a ciegas rompería subidas que hoy funcionan.
-- =============================================================================

update storage.buckets
set
  file_size_limit = 3145728, -- 3 MB
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
where id in ('business-logos', 'business-qrs', 'menu-items');
