-- Rollback: restaurar driver_businesses() sin logo_url (firma de 0120)
CREATE OR REPLACE FUNCTION public.driver_businesses()
  RETURNS TABLE (
    id uuid,
    name text,
    phone text,
    address text,
    accent_color text,
    coordinates_lat numeric,
    coordinates_lng numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT b.id, b.name, b.phone, b.address, b.accent_color,
         b.coordinates_lat, b.coordinates_lng
  FROM public.businesses b
  JOIN public.driver_restaurants dr ON dr.business_id = b.id
  JOIN public.drivers d ON d.id = dr.driver_id
  WHERE d.user_id = (SELECT auth.uid())
    AND d.is_active;
$$;
