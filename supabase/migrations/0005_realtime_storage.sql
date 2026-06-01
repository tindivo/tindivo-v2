-- =============================================================================
-- 0005 · Realtime y Storage
-- Idempotente. (pg_cron y jobs viven en 0007, aislados.)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Publicación Realtime (solo tablas que las apps suscriben; RLS del suscriptor
-- filtra las filas entregadas — las apps se suscriben con la sesión del usuario).
-- ----------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.cash_settlements; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.settlements; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.driver_availability; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.order_transfer_requests; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.admin_alerts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.reports; exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Storage buckets
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('business-logos', 'business-logos', true),
  ('business-qrs', 'business-qrs', true),
  ('menu-items', 'menu-items', true),
  ('payment-proofs', 'payment-proofs', false),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Lectura pública de buckets públicos
drop policy if exists "storage public read" on storage.objects;
create policy "storage public read" on storage.objects for select to anon, authenticated
  using (bucket_id in ('business-logos', 'business-qrs', 'menu-items'));

-- Escritura del dueño (negocio) en su carpeta (foldername[1] = business_id)
drop policy if exists "storage owner write" on storage.objects;
create policy "storage owner write" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('business-logos', 'business-qrs', 'menu-items')
    and (storage.foldername(name))[1] = (select public.current_business_id())::text
  );
drop policy if exists "storage owner modify" on storage.objects;
create policy "storage owner modify" on storage.objects for update to authenticated
  using (
    bucket_id in ('business-logos', 'business-qrs', 'menu-items')
    and (storage.foldername(name))[1] = (select public.current_business_id())::text
  );
drop policy if exists "storage owner delete" on storage.objects;
create policy "storage owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id in ('business-logos', 'business-qrs', 'menu-items')
    and (storage.foldername(name))[1] = (select public.current_business_id())::text
  );

-- Comprobantes/recibos (privados): el usuario sube y lee SOLO su propia carpeta.
-- La validación por el negocio se sirve vía API (signed URLs con service_role).
drop policy if exists "storage proofs insert" on storage.objects;
create policy "storage proofs insert" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('payment-proofs', 'receipts')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "storage proofs read own" on storage.objects;
create policy "storage proofs read own" on storage.objects for select to authenticated
  using (
    bucket_id in ('payment-proofs', 'receipts')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Admin: acceso total a storage
drop policy if exists "storage admin all" on storage.objects;
create policy "storage admin all" on storage.objects for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));
