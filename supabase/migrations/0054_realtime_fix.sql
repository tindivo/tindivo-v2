-- 0054_realtime_fix.sql
-- Asegura que orders y businesses estén en la publicación supabase_realtime
-- y tengan REPLICA IDENTITY FULL para que los eventos de UPDATE/DELETE
-- envíen la fila completa al WebSocket de Realtime.

-- 1. Agregar tablas a la publicación (idempotente: si ya están, no falla)
DO $$
BEGIN
  -- orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  -- businesses
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'businesses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
  END IF;
END $$;

-- 2. REPLICA IDENTITY FULL para que UPDATE/DELETE envíen la fila completa
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.businesses REPLICA IDENTITY FULL;
