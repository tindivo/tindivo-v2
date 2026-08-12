-- 0138_the_prunes_that_never_pruned.sql
--
-- Auditoría de las cinco purgas de retención de la 0007, comprobando para cada
-- una si la columna de la que depende se escribe alguna vez:
--
--   prune-stale-push-subscriptions  `last_failed_at`  · la escribe send-push  ✔
--   prune-idempotency-keys          `expires_at`      · NOT NULL con default  ✔
--   prune-expired-rejections        `expires_at`      · NOT NULL con default  ✔
--   prune-push-delivery-log         `at`              · NOT NULL default now  ✔
--   prune-domain-events             `published_at`    · NADIE LA ESCRIBE      ✘
--
-- Y una tabla que crece sin ninguna purga: `outbox_events`.
--
-- ── 1. La purga que no purgaba ────────────────────────────────────────────
-- `delete ... where occurred_at < now() - 90 days and published_at is not null`.
-- `domain_events.published_at` se declara en la 0002, se indexa en la 0002, se
-- lee aquí, y no hay una sola sentencia en el repo que la escriba. El predicado
-- es falso para el 100% de las filas, así que la purga nunca ha borrado nada y
-- la tabla crece sin techo desde el primer evento.
--
-- La condición además era incorrecta incluso si alguien escribiera la columna:
-- `dispatch_event` reenvía solo los doce tipos con destinatario humano, y los de
-- auditoría (`OrderValidated`, `OrderPrepExtended`, `BusinessBlocked`…) no se
-- publican nunca por diseño. Protegerlos de la purga "hasta que se publiquen"
-- es protegerlos para siempre.
--
-- Se quita la condición: a los 90 días un evento ya se despachó o ya no se va a
-- despachar. Si algún día se construye el reintento del outbox (escribir
-- `published_at`/`retry_count`/`last_error`, hoy columnas muertas), esta purga
-- tiene que volver a excluir lo que siga pendiente de reintento — pero eso se
-- añade CON el reintento, no antes.
--
-- ── 2. La tabla sin purga ─────────────────────────────────────────────────
-- `outbox_events` no aparece en ninguna purga. Sus filas `delivered` se quedan
-- para siempre. Se borran solo esas: `pending`, `processing` y `failed` siguen
-- vivas para el procesador, que reintenta con backoff sobre `next_attempt_at`.
--
-- ── Por qué es seguro aplicarla hoy ───────────────────────────────────────
-- El proyecto `tindivo-prod` se creó el 2026-07-24. La fila más antigua posible
-- tiene 18 días, así que las dos purgas borran CERO filas en su próxima corrida
-- y no empiezan a borrar hasta finales de octubre. El cambio de comportamiento
-- llega con 72 días de aviso.

-- `cron.schedule` es idempotente por nombre: reprogramar reemplaza el job.

select cron.schedule('prune-domain-events', '0 6 * * *', $cron$
  delete from public.domain_events where occurred_at < now() - interval '90 days';
$cron$);

-- Retención de 30 días, la misma que `push_delivery_log`. Solo `delivered`:
-- una fila `failed` puede estar esperando su siguiente intento y borrarla
-- perdería el evento en silencio, que es justo el defecto que esta migración
-- viene a cerrar en la tabla de al lado.
--
-- Nota sobre `event_id` (UNIQUE): al borrar una fila entregada se libera su
-- clave, así que un productor que reemitiera el MISMO `event_id` pasados 30
-- días volvería a insertarlo y a procesarlo. Los ids son deterministas por
-- pedido (`proof-rejected-final-<orderId>-<ts>`), así que reemitir uno a los 30
-- días significaría reabrir el mismo caso — y entonces reprocesarlo es lo
-- correcto, no un duplicado.
select cron.schedule('prune-outbox-events', '0 6 * * *', $cron$
  delete from public.outbox_events
   where status = 'delivered'
     and processed_at is not null
     and processed_at < now() - interval '30 days';
$cron$);
