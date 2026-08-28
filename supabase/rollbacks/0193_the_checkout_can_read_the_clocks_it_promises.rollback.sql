-- Rollback para 0193_the_checkout_can_read_the_clocks_it_promises.sql
--
-- Saca `timers` de la whitelist de lectura pública de `app_settings` y deja la
-- policy `as_public_read` exactamente como la dejó la 0113.
--
-- QUÉ SE ROMPE AL APLICAR ESTO, PARA QUE NO SORPRENDA
--   El checkout vuelve a no poder leer los plazos, y su consulta no falla: vuelve
--   VACÍA, sin error y sin fila. El componente cae en su fallback y sigue
--   pintando números que pueden no ser los que aplican. Ese silencio es el modo
--   de fallo que la 0193 vino a cerrar, así que si reviertes, revisa también que
--   el checkout no esté prometiendo minutos que la operación ya no cumple.
--
--   Lo que NO se cierra con esto: `acceptanceMinutes`, `paymentMinutes` y
--   `prepayVerificationMinutes` siguen siendo públicos por otra vía —`get_tracking`
--   se los da a cualquiera con un enlace de seguimiento (0172, 0183)—. Revertir
--   la 0193 no los vuelve secretos; solo se los quita al checkout.
--
-- IDEMPOTENTE: se recrea la policy entera con la lista completa.

DROP POLICY IF EXISTS as_public_read ON public.app_settings;

CREATE POLICY as_public_read ON public.app_settings FOR SELECT TO anon, authenticated
  USING (key IN (
    'platform_schedule',
    'support_phone',
    'support_whatsapp',
    'prepay_threshold',
    'delivery_bands',
    'coverage',
    'coverage_polygon',
    'location_validation',
    'terms_version',
    'max_cash_bill',
    'max_change'
  ));
