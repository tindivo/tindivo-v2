-- 0193 · El checkout puede leer los relojes que promete
--
-- QUÉ CAMBIA
--   `app_settings.timers` entra en la whitelist de lectura pública
--   (`as_public_read`). Nada más: ni una key nueva, ni un valor tocado.
--
-- POR QUÉ
--   La pantalla de pago va a decirle al cliente, ANTES de que haga el pedido,
--   cuánto tarda el negocio en confirmar y cuántos minutos tendrá después para
--   yapear. Hoy no puede: `timers` no está en la whitelist, así que desde el
--   navegador la consulta vuelve VACÍA —sin error, sin fila, en silencio— y el
--   componente se queda con su fallback para siempre.
--
--   Ese silencio es justo el modo de fallo que este repo ya pagó dos veces:
--
--     · `lib/prepay.ts` documenta cómo el umbral de prepago bajó de 100 a 80 en
--       la `0057` y los términos siguieron prometiendo 100 durante meses,
--       porque el número estaba escrito a mano en dos sitios.
--     · La `0172` encontró `acceptanceMinutes` diciendo 15 mientras los crons
--       cancelaban a los 5, y la `0186` lo subió a 8.
--
--   Un «8 minutos» clavado en el checkout repetiría la historia: no fallaría
--   hoy, fallaría el día que alguien toque /admin/configuracion. Desde la `0174`
--   la verdad de los plazos es `app_settings.timers` y punto; esto solo deja
--   que el checkout la lea en vez de adivinarla.
--
-- LO QUE ESTO EXPONE, DICHO EN VOZ ALTA
--   La whitelist es por key, no por campo, así que se publica el objeto entero
--   y no solo los dos minutos que el checkout necesita. Se acepta a conciencia:
--
--     · Tres de sus campos —`acceptanceMinutes`, `paymentMinutes`,
--       `prepayVerificationMinutes`— y el rango de trayecto YA son públicos:
--       `get_tracking` se los entrega a cualquiera que tenga un enlace de
--       seguimiento (`0172`, `0183`).
--     · Los demás son parámetros de operación —espera del motorizado, TTL de
--       transferencia, extensiones de preparación—, no secretos. El antifraude
--       del piloto es humano (la cajera llama), no depende de que nadie ignore
--       cuántos minutos dura una ventana.
--
--   La alternativa era partir los dos minutos en keys sueltas y whitelistar
--   solo esas, y eso devolvería los plazos a vivir en varios sitios: exactamente
--   lo que la `0174` unificó. Se descarta.
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
    'max_change',
    'timers'
  ));
