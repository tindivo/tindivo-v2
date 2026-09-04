-- ============================================================================
-- ROLLBACK 0209 — Treinta envíos más van por nuestra cuenta
-- ============================================================================
--
-- Devuelve `app_settings.promo_free_delivery` al valor exacto que tenía en prod
-- antes de la 0209, medido el 2026-09-03: la ventana de agosto, ya vencida.
--
-- LO QUE ESTE ROLLBACK **NO** DESHACE, y hay que saberlo antes de correrlo:
-- las redenciones de `free-delivery-2026-09` que ya se hayan otorgado siguen en
-- `promo_redemptions`, y los pedidos que salieron con `delivery_fee = 0` siguen
-- con envío 0. Es lo correcto: al vecino ya se le prometió y se le entregó, y
-- `delivered` es terminal (invariante 8). Esto apaga el grifo hacia adelante,
-- no reescribe lo servido.
--
-- SI SOLO HACE FALTA PARAR LA PROMO, no uses esto: usa el freno rápido, que no
-- pierde el código ni la ventana y deja el rastro legible.
--
--   update public.app_settings
--      set value = jsonb_set(value, '{active}', 'false'::jsonb)
--    where key = 'promo_free_delivery';
--
-- Volver a la config de agosto tiene un efecto de más: el contador y los índices
-- únicos vuelven a mirar `free-delivery-2026-08`, así que si alguien reactivara
-- esa ventana, los 7 de agosto seguirían bloqueados y los de septiembre no. Cada
-- edición vive en su propio código, a propósito.
-- ============================================================================

update public.app_settings
   set value = value || jsonb_build_object(
         'code',            'free-delivery-2026-08',
         'active',          true,
         'from',            '2026-08-25',
         'to',              '2026-08-28',
         'max_redemptions', 100
       )
 where key = 'promo_free_delivery';
