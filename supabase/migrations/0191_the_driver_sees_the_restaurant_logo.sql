-- La pantalla «Locales» del motorizado necesita el logo del restaurante para
-- pintarlo en la tarjeta en vez de una letra genérica. El RPC no lo devolvía
-- porque no existía la pantalla cuando se escribió.
--
-- CREATE OR REPLACE no admite cambiar la firma de retorno, así que hay que
-- DROP + CREATE. `driver_businesses()` la llama solo el hook del motorizado,
-- así que la ventana sin función es insignificante.

DROP FUNCTION IF EXISTS public.driver_businesses();

CREATE FUNCTION public.driver_businesses()
  RETURNS TABLE (
    id uuid,
    name text,
    phone text,
    address text,
    accent_color text,
    logo_url text,
    coordinates_lat numeric,
    coordinates_lng numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT b.id, b.name, b.phone, b.address, b.accent_color, b.logo_url,
         b.coordinates_lat, b.coordinates_lng
  FROM public.businesses b
  JOIN public.driver_restaurants dr ON dr.business_id = b.id
  JOIN public.drivers d ON d.id = dr.driver_id
  WHERE d.user_id = (SELECT auth.uid())
    AND d.is_active;
$$;

COMMENT ON FUNCTION public.driver_businesses() IS
  'Locales asignados al motorizado autenticado, con logo_url para la pantalla '
  'de Locales. SECURITY DEFINER porque las policies de businesses no dejan '
  'leer la tabla al motorizado.';

REVOKE EXECUTE ON FUNCTION public.driver_businesses() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.driver_businesses() TO authenticated, service_role;
