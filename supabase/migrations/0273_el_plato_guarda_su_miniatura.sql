-- ============================================================================
-- 0273 — El plato guarda la dirección de su miniatura (D-55, PR A)
-- ============================================================================
--
-- Las apps nativas pintan la carta con fotos de 92 dp y hoy bajan la imagen grande (1200 px).
-- El panel de negocios sube ahora, junto a la foto, una miniatura WebP de ~384 px; esta
-- columna guarda su URL. Es opcional: los platos ya subidos la tienen en null hasta que un
-- proceso por lotes la complete, y el cliente cae a `image_url` si falta.
--
-- Solo añade la columna: sin tocar RLS, permisos, funciones ni datos.

alter table public.menu_items
  add column if not exists thumbnail_url text null;

comment on column public.menu_items.thumbnail_url is
  'D-55: URL de la miniatura WebP (~384 px) del plato. Opcional: null = aún no generada; el cliente usa image_url.';
