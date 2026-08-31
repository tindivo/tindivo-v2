-- ============================================================================
-- 0198 — Un `user_agent` NO identifica un dispositivo
-- ============================================================================
--
-- POR QUÉ EXISTE ESTA COLUMNA.
--
-- `POST /push/subscriptions` limpia "zombies" antes de dar de alta: mismo
-- usuario + mismo `user_agent` + endpoint distinto = endpoint rotado, se borra
-- el viejo. La intención es correcta; la CLAVE no.
--
-- Desde la *UA reduction* de Chrome, el `user_agent` de Android está congelado
-- en `Android 10; K` y es idéntico byte a byte entre teléfonos distintos. En
-- `tindivo-prod` (medido el 2026-08-29) hay NUEVE dispositivos de nueve usuarios
-- distintos compartiendo esta cadena exacta:
--
--   Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko)
--   Chrome/151.0.0.0 Mobile Safari/537.36
--
-- Entre usuarios distintos no hay daño, porque el borrado va acotado con
-- `user_id`. Pero DENTRO de un mismo usuario, dos Android se borran la
-- suscripción mutuamente: el que abre la app último deja al otro sin avisos, en
-- silencio, y el otro no se entera hasta que un pedido no le suena. Hoy no ha
-- pasado solo porque los dos equipos del único motorizado son de plataformas
-- distintas (un iPhone y un Android).
--
-- `install_id` es un UUID que genera el CLIENTE y guarda en `localStorage`. Es
-- estable por instalación de PWA, sobrevive a la rotación del endpoint, y no
-- colisiona entre dos dispositivos. Esa es la clave que la limpieza debía usar
-- desde el principio.
--
-- NULLABLE A PROPÓSITO, y no se rellena hacia atrás. No se puede: no existe
-- forma de averiguar el `install_id` de una instalación que nunca lo mandó. Las
-- filas viejas se quedan en NULL y el servidor las trata como "no identificable"
-- — que es la verdad— y NO las usa para borrar nada. Ver la nota de abajo.
--
-- LO QUE ESTA MIGRACIÓN NO HACE: no toca ni una fila de datos. Las dos
-- suscripciones vivas de producción (un iPhone y un Android, las dos entregando,
-- `failure_count = 0`) se quedan exactamente como están. Borrar una le apaga los
-- avisos en un equipo que sí usa.
-- ============================================================================

alter table public.push_subscriptions
  add column if not exists install_id text;

comment on column public.push_subscriptions.install_id is
  'UUID por instalación de PWA, generado en el cliente y guardado en localStorage. '
  'Clave REAL de identidad de dispositivo para la limpieza de zombies: el '
  'user_agent NO lo es (UA reduction de Chrome congela Android en "Android 10; K", '
  'idéntico entre teléfonos). NULL = cliente antiguo que todavía no lo manda; en '
  'ese caso NO se limpia por user_agent, porque eso reintroduciría el fallo que '
  'esta columna existe para cerrar.';

-- La limpieza consulta por (user_id, install_id) en cada alta de suscripción.
-- Parcial: las filas en NULL nunca son objeto de esa consulta, así que no
-- ocupan índice.
create index if not exists ps_user_install_idx
  on public.push_subscriptions (user_id, install_id)
  where install_id is not null;
