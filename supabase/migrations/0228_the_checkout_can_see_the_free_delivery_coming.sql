-- =============================================================================
-- 0228 · El checkout puede ver venir el envío gratis
--
-- Idempotente (create or replace). Rollback en
-- supabase/rollbacks/0228_the_checkout_can_see_the_free_delivery_coming.rollback.sql
-- =============================================================================
--
-- EL PROBLEMA
-- La 0227 dejó "4 Alitas Crispy" con envío gratis los martes y jueves, y el
-- servidor lo cobra bien: `create_customer_order` pone `delivery_fee = 0`. Pero
-- la pantalla de pago del cliente sigue mostrando S/2.00 hasta el último toque,
-- porque el único cálculo de envío gratis que conoce el frontend es el de la
-- promo de lanzamiento (0187), que responde por `auth.uid()` y no mira la
-- bolsa. El cliente ve que le cobran el envío y puede abandonar el pedido sin
-- llegar a la sorpresa.
--
-- QUÉ AÑADE
-- Una función de LECTURA, `cart_item_free_delivery`, que contesta lo mismo que
-- el guard de la 0227 pero para una bolsa dada: ¿este carrito —un solo plato
-- distinto, y ese plato con envío gratis hoy— se lleva el envío gratis? El
-- checkout la llama cuando cambia la bolsa o el método, y pinta S/0 tachando
-- el nominal.
--
-- ES SOLO PARA PINTAR. Quien decide el precio sigue siendo
-- `create_customer_order`. Por eso esta función NO comprueba el canal
-- (`p_source`): el guard real ya exige `customer_pwa`, y esto lo llama solo la
-- app del cliente. Un `true` de más aquí no cobra de menos en ningún sitio.
--
-- MISMA EXPRESIÓN QUE EL GUARD, A PROPÓSITO. "Un solo plato distinto" es
-- `count(distinct ...) = 1` en las dos —la 0227 sobre `p_items`, esta sobre
-- `p_item_ids`— y el día lo decide la MISMA `menu_item_free_delivery_day`. Si
-- una cambia sin la otra, el checkout miente respecto a lo que se va a cobrar.
--
-- FAIL-CLOSED, como la 0227: bolsa vacía, plato inexistente o de otro negocio,
-- o plato sin `free_delivery_days` → `false`. El `coalesce` final cierra el
-- caso del array vacío, donde `array_length(...,1)` es NULL y no 0.
-- =============================================================================

create or replace function public.cart_item_free_delivery(
  p_business_id uuid,
  p_item_ids uuid[]
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    array_length(p_item_ids, 1) is not null
    and (select count(distinct x) from unnest(p_item_ids) x) = 1
    and public.menu_item_free_delivery_day(
      (select mi.free_delivery_days
         from public.menu_items mi
        where mi.id = p_item_ids[1]
          and mi.business_id = p_business_id)
    ),
    false
  )
$function$;

comment on function public.cart_item_free_delivery(uuid, uuid[]) is
  'Solo para pintar el checkout: ¿esta bolsa (un plato distinto, con envío gratis hoy) se lleva el envío gratis de la 0227? Quien decide el precio es create_customer_order.';

-- Espejo de `current_customer_promo_free_delivery` (0187): la llama la app del
-- cliente autenticado, nadie más la necesita.
revoke all on function public.cart_item_free_delivery(uuid, uuid[])
  from public, anon;
grant execute on function public.cart_item_free_delivery(uuid, uuid[])
  to authenticated, service_role;
