-- =============================================================================
-- 0083 · RPC get_order_intake_status() con hora de apertura en el payload
-- =============================================================================

-- 1. Limpieza dinámica por catálogo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'get_order_intake_status'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- 2. RPC public.get_order_intake_status() — devuelve isOpen, cutoff, startTime, y mensaje con hora de apertura
CREATE OR REPLACE FUNCTION public.get_order_intake_status(p_custom_time timestamptz DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_schedule jsonb;
  v_cutoff jsonb;
  v_cutoff_time text;
  v_start_time text;
  v_is_open boolean;
  v_now_lima timestamp;
  v_msg text;
BEGIN
  v_now_lima := timezone('America/Lima', COALESCE(p_custom_time, now()));

  SELECT value INTO v_schedule FROM public.app_settings WHERE key = 'platform_schedule';
  SELECT value INTO v_cutoff FROM public.app_settings WHERE key = 'order_intake_cutoff';

  v_cutoff_time := COALESCE(v_cutoff #>> '{}', '22:30');
  v_start_time  := COALESCE(v_schedule ->> 'startHHMM', '18:00');
  v_is_open     := public.is_within_order_intake_window(p_custom_time);

  IF NOT v_is_open THEN
    v_msg := format(
      'Recibimos pedidos de %s a %s. Vuelve dentro del horario.',
      v_start_time, v_cutoff_time
    );
  END IF;

  RETURN jsonb_build_object(
    'isOpen',          v_is_open,
    'cutoff',          v_cutoff_time,
    'startTime',       v_start_time,
    'serverTimeLima',  to_char(v_now_lima, 'YYYY-MM-DD HH24:MI:SS'),
    'message',         v_msg
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_intake_status(timestamptz) TO anon, authenticated, service_role;
