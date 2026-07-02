-- =============================================================================
-- 0050 · Modo solo-catálogo (WhatsApp).
--
-- 1) Relaja el CHECK capabilities_consistent: publicar catálogo ya no exige
--    aceptar pedidos web (pickup/delivery). Se conservan las otras cláusulas.
-- 2) Añade businesses.whatsapp_number: contacto PÚBLICO opt-in para pedidos
--    por WhatsApp (wa.me). Distinto de phone, que sigue siendo privado.
-- 3) Re-deriva primary_capability: catálogo sin pickup ni delivery -> catalog_only.
--
-- Requiere 0049 (valor de enum 'catalog_only'). Idempotente.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) CHECK relajado (drop + add = idempotente; estrictamente más débil que el
--    anterior, por lo que las filas existentes validan sin cambios).
-- ----------------------------------------------------------------------------
alter table public.businesses drop constraint if exists capabilities_consistent;
alter table public.businesses add constraint capabilities_consistent check (
  (not accepts_web_pickup or publishes_catalog)
  and (not accepts_web_delivery or (publishes_catalog and uses_tindivo_drivers))
);

-- ----------------------------------------------------------------------------
-- 2) Contacto público para pedidos por WhatsApp (9 dígitos, empieza en 9).
-- ----------------------------------------------------------------------------
alter table public.businesses add column if not exists whatsapp_number text;
alter table public.businesses drop constraint if exists whatsapp_number_format;
alter table public.businesses add constraint whatsapp_number_format
  check (whatsapp_number is null or whatsapp_number ~ '^9[0-9]{8}$');
comment on column public.businesses.whatsapp_number is
  'Número WhatsApp PÚBLICO para pedidos en modo catálogo (wa.me). Distinto de phone (privado).';

-- ----------------------------------------------------------------------------
-- 3) Derivación de primary_capability con la rama catalog_only.
--    OJO: create or replace descarta el SET search_path aplicado en 0008 vía
--    alter function -> se re-declara aquí explícitamente.
-- ----------------------------------------------------------------------------
create or replace function public.derive_business_primary_capability(
  p_publishes_catalog boolean,
  p_accepts_web_pickup boolean,
  p_accepts_web_delivery boolean,
  p_uses_tindivo_drivers boolean
) returns public.business_primary_capability
  language plpgsql immutable set search_path = ''
as $$
begin
  if not p_publishes_catalog then
    if p_uses_tindivo_drivers then return 'drivers_only'::public.business_primary_capability;
    else return 'pickup_local'::public.business_primary_capability; end if;
  end if;
  if p_accepts_web_pickup and p_accepts_web_delivery then
    return 'catalog_full'::public.business_primary_capability;
  elsif p_accepts_web_delivery then
    return 'catalog_delivery'::public.business_primary_capability;
  elsif p_accepts_web_pickup then
    return 'catalog_pickup'::public.business_primary_capability;
  else
    return 'catalog_only'::public.business_primary_capability;
  end if;
end;
$$;
