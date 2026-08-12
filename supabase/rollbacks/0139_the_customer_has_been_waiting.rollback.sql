-- =============================================================================
-- ROLLBACK 0139 · Quita el umbral de entrega tardía de app_settings.timers
-- =============================================================================
--
-- La 0139 solo añadió la clave `deliveryLateMinutes` al JSON de `timers`. No
-- creó tablas ni funciones, y NINGUNA función de la base la lee: es un umbral
-- de presentación que consume la PWA del motorizado para decidir cuándo el
-- reloj de reparto se pinta en rojo.
--
-- CONSECUENCIA DE REVERTIR: el reloj vuelve a contar siempre en negro. No se
-- rompe ninguna transición, ni cargo, ni aviso.
--
-- Idempotente: `- 'clave'` sobre un jsonb que no la tiene no hace nada.
-- =============================================================================

update public.app_settings
   set value = value - 'deliveryLateMinutes',
       updated_at = now()
 where key = 'timers'
   and value ? 'deliveryLateMinutes';
