-- =============================================================================
-- 0139 · El cliente lleva esperando: umbral de entrega tardía.
--
-- POR QUÉ.
--   La tarjeta del motorizado enseña, con el pedido ya recogido, cuánto lleva
--   rodando (`picked_up_at` → ahora). Ese reloj contaba en negro y no se ponía
--   rojo NUNCA, porque `app_settings.timers` no definía ningún umbral de
--   entrega tardía: `noShowWaitMinutes` cubre la espera en la puerta del
--   cliente, no el trayecto. Ponerlo rojo a los X minutos habría sido fabricar
--   una regla de negocio que nadie había decidido.
--
--   Ya está decidida: 20 minutos.
--
-- POR QUÉ EN `app_settings` Y NO EN EL CÓDIGO.
--   Es el mismo criterio que `queueLeadMinutes` (§23) y `urgentAfterMinutes`:
--   los parámetros operativos se tocan sin desplegar. En un piloto donde la
--   distancia de reparto todavía se está aprendiendo, este número va a moverse.
--
-- ALCANCE: SOLO PINTA.
--   Ninguna función lo lee todavía; no cambia ninguna transición, ni cargos, ni
--   avisos. Es un umbral de presentación que consume la PWA del motorizado para
--   decidir cuándo el reloj de reparto se pone rojo.
--
-- Idempotente: solo escribe si la clave no está.
-- =============================================================================

update public.app_settings
   set value = value || '{"deliveryLateMinutes": 20}'::jsonb,
       updated_at = now()
 where key = 'timers'
   and not (value ? 'deliveryLateMinutes');
