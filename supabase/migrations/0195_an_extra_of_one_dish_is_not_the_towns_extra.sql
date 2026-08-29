-- 0195 · Un extra de un plato no es un extra del negocio
--
-- QUÉ CAMBIA
--   `menu_modifier_groups.is_library`: dice si el grupo es de la BIBLIOTECA del
--   negocio (reutilizable, se busca y se vincula desde cualquier plato) o si es
--   propio del plato donde nació. Nada más: ni tablas nuevas, ni datos tocados
--   más allá del backfill de abajo.
--
-- POR QUÉ
--   El esquema ya permitía compartir grupos —`business_id` en el grupo y la
--   tabla puente `menu_item_modifier_groups`—, pero no distinguía las dos cosas
--   que el dueño sí distingue: «Cremas», que va en medio menú, y «Término de
--   cocción», que es de la hamburguesa y de nada más.
--
--   Sin esa distinción, el buscador de extras ofrece TODO. Medido en prod hoy:
--
--     Pizza Priamo     37 platos · 43 grupos · 0 compartidos
--     La Florencia     75 platos · 13 grupos · 0 compartidos
--     Pollería Nadia    6 platos · 10 grupos · 0 compartidos
--     Al Punto         10 platos ·  2 grupos · 0 compartidos
--
--   68 grupos, todos usados por un solo plato. A Priamo le abriríamos una lista
--   de 43 «reutilizables» de los que ninguno se pensó para reutilizar. Un
--   buscador que devuelve ruido se deja de usar la segunda vez.
--
-- POR QUÉ UNA COLUMNA Y NO DEDUCIRLO DE LOS ENLACES
--   Tentaba definir «es de biblioteca» como «lo usan 2+ platos». No sirve: un
--   grupo recién creado en el panel de Extras, todavía sin vincular a nada,
--   tendría cero enlaces y sería invisible justo en el momento en que el dueño
--   lo acaba de crear y lo va a buscar. La pertenencia a la biblioteca es una
--   decisión, no un recuento.
--
-- EL BACKFILL DICE LA VERDAD, NO LO CÓMODO
--   Todo lo que existe hoy entra como `false`, porque eso es lo que es: 68
--   grupos de un solo plato. La consecuencia es que la biblioteca NACE VACÍA y
--   se llena cuando alguien sube un grupo a propósito. Es lo correcto y además
--   es lo que evita el ruido del día uno.
--
--   El `update` de 2+ enlaces no cambia nada hoy (hay cero), pero se deja
--   porque la migración tiene que ser correcta también si se aplica sobre una
--   base donde ya se compartió algo — un entorno de pruebas, o prod dentro de
--   dos semanas si esto se aplica tarde.
--
-- IDEMPOTENTE: `ADD COLUMN IF NOT EXISTS` + un `UPDATE` que converge.

ALTER TABLE public.menu_modifier_groups
  ADD COLUMN IF NOT EXISTS is_library boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.menu_modifier_groups.is_library IS
  'true = grupo de la biblioteca del negocio: se busca y se vincula desde cualquier plato. false = propio del plato donde se creó; no aparece en el buscador de extras. Un grupo propio se sube a la biblioteca a mano desde el plato.';

-- Lo que ya se comparte, es de biblioteca por definición: si dos platos lo
-- usan, esconderlo del buscador seria mentir sobre lo que ya pasa.
UPDATE public.menu_modifier_groups g
   SET is_library = true
 WHERE g.is_library = false
   AND (SELECT count(*) FROM public.menu_item_modifier_groups l WHERE l.group_id = g.id) >= 2;

-- El buscador filtra por `business_id` + `is_library` y ordena por nombre.
CREATE INDEX IF NOT EXISTS idx_menu_modifier_groups_library
  ON public.menu_modifier_groups (business_id, name)
  WHERE is_library;
