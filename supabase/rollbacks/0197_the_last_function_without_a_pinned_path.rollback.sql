-- Rollback para 0197_the_last_function_without_a_pinned_path.sql
--
-- Devuelve `point_in_ring` a no declarar search_path.
--
-- Solo tendría sentido si clavarlo rompiera alguna llamada que no vi, y eso
-- solo pasaría si alguien añade al cuerpo una referencia a una tabla o a una
-- función de `public` sin cualificar. La señal sería un `relation ... does not
-- exist` o un `function ... does not exist` desde `point_in_coverage_polygon`.
--
-- Si llegas aquí por eso, la salida buena NO es este rollback: es cualificar la
-- referencia con `public.`, que es lo que hacen las demás funciones del repo.
--
-- IDEMPOTENTE.

ALTER FUNCTION public.point_in_ring(numeric, numeric, jsonb) RESET search_path;
