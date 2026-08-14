-- Rollback de 0161: elimina delivery_band_for_point, point_in_ring y delivery_zones
drop function if exists public.delivery_band_for_point(numeric, numeric);
drop function if exists public.point_in_ring(numeric, numeric, jsonb);
drop table if exists public.delivery_zones cascade;

-- Restaura point_in_coverage_polygon a su versión embebida previa (0064)
create or replace function public.point_in_coverage_polygon(
  p_lat numeric,
  p_lng numeric
) returns boolean
  language plpgsql stable
as $$
declare
  v_poly jsonb;
  v_n int;
  v_i int;
  v_j int;
  v_inside boolean := false;
  v_xi numeric; v_yi numeric;
  v_xj numeric; v_yj numeric;
begin
  if p_lat is null or p_lng is null then
    return false;
  end if;

  select value->'polygon' into v_poly
  from public.app_settings
  where key = 'coverage_polygon';

  if v_poly is null or jsonb_typeof(v_poly) <> 'array' then
    return true;
  end if;

  v_n := jsonb_array_length(v_poly);
  if v_n < 3 then
    return true;
  end if;

  v_j := v_n - 1;
  for v_i in 0..v_n-1 loop
    v_yi := (v_poly->v_i->>'lat')::numeric;
    v_xi := (v_poly->v_i->>'lng')::numeric;
    v_yj := (v_poly->v_j->>'lat')::numeric;
    v_xj := (v_poly->v_j->>'lng')::numeric;

    if ((v_yi > p_lat) <> (v_yj > p_lat)) and
       (p_lng < (v_xj - v_xi) * (p_lat - v_yi) / (v_yj - v_yi) + v_xi) then
      v_inside := not v_inside;
    end if;
    v_j := v_i;
  end loop;

  return v_inside;
end;
$$;
