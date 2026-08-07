-- =============================================================================
-- 0090 · Corrección de search_path y manejo de excepciones en handle_new_user()
-- =============================================================================
-- Soluciona la falla de GoTrue / Supabase Auth ("Database error checking email")
-- asignando search_path = public, pg_catalog y capturando excepciones para evitar
-- fallas en cascada al autenticar usuarios.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_raw text;
  v_role public.user_role;
  v_email text;
  v_full_name text;
BEGIN
  v_raw := new.raw_app_meta_data ->> 'primary_role';
  IF v_raw IS NULL OR v_raw NOT IN ('customer', 'business', 'driver', 'admin') THEN
    v_role := 'customer'::public.user_role;
  ELSE
    v_role := v_raw::public.user_role;
  END IF;

  v_email := new.email;
  v_full_name := COALESCE(new.raw_user_meta_data ->> 'full_name', v_email, 'Usuario');

  IF v_email IS NOT NULL THEN
    INSERT INTO public.users (id, email, full_name, primary_role, is_active)
    VALUES (new.id, v_email, v_full_name, v_role, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, v_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
