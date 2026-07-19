-- 0064_create_point_in_coverage_polygon.sql
-- Función helper para validar si una coordenada de entrega cae dentro del polígono de cobertura
-- o dentro del radio circular fallback de app_settings.coverage.

create or replace function public.point_in_coverage_polygon(p_lat numeric, p_lng numeric)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_poly_json jsonb;
  v_cov_json jsonb;
  v_center_lat numeric;
  v_center_lng numeric;
  v_radius_km numeric;
  v_dist numeric;
  v_points jsonb;
  v_n int;
  v_inside boolean := false;
  v_i int;
  v_j int;
  v_lat_i numeric; v_lng_i numeric;
  v_lat_j numeric; v_lng_j numeric;
begin
  if p_lat is null or p_lng is null then
    return false;
  end if;

  -- 1) Intentar leer el polígono de app_settings (key = 'coverage_polygon')
  select value into v_poly_json from public.app_settings where key = 'coverage_polygon';
  if v_poly_json is not null and v_poly_json -> 'polygon' is not null then
    v_points := v_poly_json -> 'polygon';
    v_n := jsonb_array_length(v_points);
    if v_n >= 3 then
      v_j := v_n - 1;
      for v_i in 0 .. (v_n - 1) loop
        v_lat_i := (v_points -> v_i ->> 'lat')::numeric;
        v_lng_i := (v_points -> v_i ->> 'lng')::numeric;
        v_lat_j := (v_points -> v_j ->> 'lat')::numeric;
        v_lng_j := (v_points -> v_j ->> 'lng')::numeric;

        if (((v_lat_i > p_lat) <> (v_lat_j > p_lat)) and
            (p_lng < (v_lng_j - v_lng_i) * (p_lat - v_lat_i) / nullif(v_lat_j - v_lat_i, 0) + v_lng_i)) then
          v_inside := not v_inside;
        end if;
        v_j := v_i;
      end loop;
      return v_inside;
    end if;
  end if;

  -- 2) Fallback: radio circular desde app_settings.coverage (o centro por defecto en San Jacinto: -9.1547, -78.5042, r=15km)
  select value into v_cov_json from public.app_settings where key = 'coverage';
  v_center_lat := coalesce((v_cov_json ->> 'centerLat')::numeric, -9.1547);
  v_center_lng := coalesce((v_cov_json ->> 'centerLng')::numeric, -78.5042);
  v_radius_km := coalesce((v_cov_json ->> 'radiusKm')::numeric, 15.0);

  v_dist := public.geo_distance_km(v_center_lat::double precision, v_center_lng::double precision, p_lat::double precision, p_lng::double precision);
  return v_dist <= v_radius_km;
end;
$$;

grant execute on function public.point_in_coverage_polygon(numeric, numeric) to anon, authenticated, service_role;
