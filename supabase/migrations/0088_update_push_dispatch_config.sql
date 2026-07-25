-- =============================================================================
-- 0088 · Actualización de push_dispatch para el proyecto tindivo-prod
-- =============================================================================

UPDATE public.app_settings
SET value = jsonb_build_object(
  'url', 'https://zpnipajgwfthxhdtzhly.supabase.co/functions/v1/send-push',
  'anonKey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwbmlwYWpnd2Z0aHhoZHR6aGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTk0NDEsImV4cCI6MjEwMDQ3NTQ0MX0.ANHK8HWPqW7dN7SCOR37DQ7d8xEEdKgNThxOWbfsh20'
)
WHERE key = 'push_dispatch';
