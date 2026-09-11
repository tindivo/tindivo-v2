-- ============================================================================
-- 0217 — El restaurante lee la nota, no la carta
-- ============================================================================
--
-- LA PROMESA QUE HABÍA QUE SOSTENER. La hoja de la reseña le dice al cliente
-- que su nota la ve el restaurante y que lo que escriba lo lee solo el equipo
-- de Tindivo. Tal como quedó la 0215, eso era una promesa de INTERFAZ: la
-- policy `order_reviews_business_read` deja al dueño leer la fila entera, y el
-- panel se limitaba a no pedir la columna. Bastaba abrir la consola del
-- navegador y pedirla.
--
-- Y no es una promesa cosmética. En un pueblo el negocio tiene el teléfono del
-- pedido delante: si además lee el párrafo, un comentario duro termina en una
-- llamada al cliente. Que el texto no le llegue es lo que hace que valga la
-- pena escribirlo.
--
-- POR QUÉ GRANTS DE COLUMNA Y NO OTRA POLICY. RLS filtra FILAS, no columnas:
-- no hay policy que diga «esta fila sí, pero sin este campo». Lo que sí existe
-- es `GRANT SELECT (col, col, ...)`, que se comprueba antes que la policy y
-- hace fallar la consulta que pida una columna no concedida. Es el mecanismo
-- pensado para esto.
--
-- A QUIÉN AFECTA. A todo el rol `authenticated`, o sea también al cliente que
-- escribió el comentario. Es aceptable y deliberado: en Fase A no hay ninguna
-- pantalla donde el cliente relea su reseña —la tarjeta desaparece al enviarla—
-- así que nadie pierde nada. El día que se construya «tus reseñas», se abre con
-- una vista o una RPC que devuelva solo lo suyo, no ensanchando este grant.
--
-- `service_role` conserva la fila entera: por ahí leen el admin y la API, que
-- son quienes SÍ tienen que ver el texto.
--
-- Idempotente.
-- ============================================================================

-- El grant de tabla completo de la 0215 es justo el que hay que retirar. Se
-- revoca todo y se vuelve a conceder solo lo que el negocio y el cliente
-- necesitan ver. `business_id` y `customer_user_id` entran porque son lo que
-- comparan las policies al leer.
revoke select on table public.order_reviews from authenticated;

grant select (
  id,
  order_id,
  business_id,
  driver_id,
  customer_user_id,
  rating,
  tags,
  created_at
) on table public.order_reviews to authenticated;

-- `comment` queda fuera a propósito. Si alguna vez se concede, que sea en una
-- migración que diga por qué y no de rebote al recrear un grant.

-- service_role sigue con todo: es el camino del admin y de la API.
grant all on table public.order_reviews to service_role;

-- anon no toca nada, igual que en la 0215.
revoke all on table public.order_reviews from public, anon;
