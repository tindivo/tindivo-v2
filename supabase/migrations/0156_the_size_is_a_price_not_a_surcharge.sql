-- =============================================================================
-- 0156 · El tamaño es un precio, no un recargo
-- Idempotente.
--
-- Un grupo de modificadores sirve hoy para dos cosas que se escriben igual y
-- se leen distinto:
--
--   "Salsas extras"  ají +2, chimichurri +3   -> son recargos de verdad
--   "Tamaño"         pequeña 13, mediana 26   -> son EL precio del plato
--
-- Con el segundo la cajera se equivocaba de la forma más cara posible: ponía
-- 13 en el precio base del plato y otra vez 13 en la opción "Pequeña", y el
-- cliente terminaba pagando 26 por la pizza chica. No era un error de
-- interpretación suyo: `create_customer_order` suma de verdad
-- (0148:251-266), así que el pedido salía a 26.
--
-- OJO — esta columna NO cambia la aritmética. El precio sigue siendo
--
--     unit = menu_items.base_price + Σ menu_modifier_options.additional_price
--
-- y `additional_price` sigue guardando un DELTA sobre el precio base. Lo único
-- que cambia es cómo se ESCRIBE y cómo se MUESTRA ese delta:
--
--   'delta' (default, comportamiento de siempre) -> el negocio escribe "+3.00"
--            y el cliente lee "+ S/ 3.00" / "Incluido".
--   'total'                                      -> el negocio escribe el
--            precio final ("26.00") y el editor guarda el delta que
--            corresponde; el cliente lee "S/ 26.00". El precio base del plato
--            queda atado a la opción más barata del grupo, así que el delta
--            más chico siempre es 0 y el "Desde S/ x" del catálogo es un
--            precio que de verdad se puede pagar.
--
-- Por eso el nombre es `price_display` y no `pricing_mode`: si algún día
-- alguien lee 'total' como "aquí el precio reemplaza al base", va a tocar la
-- RPC del dinero sin necesidad. La RPC no se entera de esta columna, y así
-- conviene que siga.
--
-- 'total' solo tiene sentido en un grupo obligatorio de elegir 1 (si fuera
-- opcional, no elegir nada dejaría el plato al precio de la opción más barata
-- sin haberla pedido) y en un grupo que pertenece a un solo plato. Ambas
-- cosas las garantiza el editor de negocios, que es quien crea los grupos:
-- inserta una fila nueva por plato y solo ofrece el switch en
-- "Obligatorio, elegir 1". No se codifican como CHECK porque el orden en que
-- el editor guarda los cambios haría saltar la restricción a mitad de camino.
-- =============================================================================

alter table public.menu_modifier_groups
  add column if not exists price_display text not null default 'delta';

alter table public.menu_modifier_groups
  drop constraint if exists menu_modifier_groups_price_display_check;

alter table public.menu_modifier_groups
  add constraint menu_modifier_groups_price_display_check
  check (price_display in ('delta', 'total'));

comment on column public.menu_modifier_groups.price_display is
  'Solo presentación: cómo se escribe y se muestra additional_price. delta = "+S/3" (recargo). total = "S/26" (precio final; el precio base del plato lo fija la opción más barata). La aritmética de create_customer_order no cambia: siempre suma deltas.';
